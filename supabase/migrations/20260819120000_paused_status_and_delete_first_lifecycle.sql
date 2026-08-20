-- ============================================================================
-- Canonical `paused` status + delete-first product lifecycle
--
-- Two connected changes, in one migration because neither is safe alone:
--
-- 1. `paused` becomes a real product status.
--    Until now a paused product was stored as `status = 'published'` with a
--    secondary `paused_by_brand = true` flag. Every consumer therefore had to
--    remember to check both, and any that forgot treated a paused product as
--    live. This migration makes `status = 'paused'` the single truth,
--    backfills existing rows, and constrains the legacy flag so the two can
--    never contradict each other again.
--
-- 2. Permanent deletion becomes the normal destructive action.
--    Archive stops being an ordinary menu action and becomes the fallback for
--    products that cannot be deleted because they carry immutable business
--    history. A Published or Paused product with no such history is now
--    permanently deletable through the same preflight + locked transaction
--    the Draft/Archived paths already use.
--
-- Forward-only. Every statement is idempotent and safe to re-run: no
-- destructive backfill, no product is made visible, no Archived product is
-- restored, and existing deletion history is untouched.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Status vocabulary
-- ----------------------------------------------------------------------------

-- Widen the constraint BEFORE the backfill, otherwise the update below would
-- violate the old one.
alter table public.products drop constraint if exists products_status_check;
alter table public.products add constraint products_status_check
  check (status in ('draft', 'pending_review', 'changes_requested', 'published', 'paused', 'archived'));

-- Backfill. Scoped to exactly the legacy combination, so re-running finds
-- nothing to do (the flag is cleared in the same statement). Deliberately
-- touches only status/paused_by_brand: publish_date, first_visible_at,
-- first_stocked_at, launch_policy, stock and history all carry over
-- untouched, and nothing here can make a product visible — 'paused' fails
-- the visibility predicate exactly as `published + paused_by_brand` did.
update public.products
set status = 'paused', paused_by_brand = false
where status = 'published' and coalesce(paused_by_brand, false) = true;

-- Deprecate the flag. It stays as a column (dropping it would break any
-- unmigrated reader with a hard error rather than a harmless `false`), but
-- can never again be set true, so the split-brain states this migration
-- exists to remove — 'published' + flag, 'paused' without it, 'archived' +
-- flag — are all now unrepresentable.
update public.products set paused_by_brand = false where paused_by_brand is true;

alter table public.products drop constraint if exists products_paused_flag_deprecated;
alter table public.products add constraint products_paused_flag_deprecated
  check (paused_by_brand is not true);

comment on column public.products.paused_by_brand is
  'DEPRECATED and constrained to false/null. Pause is `status = ''paused''`. '
  'Retained only so unmigrated readers see a harmless false instead of erroring.';

-- Permanent deletion is now reachable from the live states too, so the
-- deletion-history snapshot has to be able to record where it happened.
alter table public.product_deletion_history drop constraint if exists product_deletion_history_deleted_from_check;
alter table public.product_deletion_history add constraint product_deletion_history_deleted_from_check
  check (deleted_from in ('draft', 'published', 'paused', 'archived'));

-- ----------------------------------------------------------------------------
-- 2. Canonical customer visibility
--
-- The one predicate every storefront/purchasing surface funnels through:
-- storefront_products, the products RLS policy, the order_items availability
-- trigger, back-in-stock, cart validation, COD placement and the Paymob
-- intention/webhook paths. Replacing the `published + not paused_by_brand`
-- pair with a plain status test here is what makes `paused` genuinely hidden
-- everywhere at once, rather than in each caller that remembered to check.
-- ----------------------------------------------------------------------------

create or replace function private.is_product_customer_visible(p_product_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.status = 'published'
    and (p.publish_date is null or p.publish_date <= now())
    and exists (select 1 from public.brands b where b.id = p.brand_id and b.is_active = true)
    and (
      p.launch_policy = 'show_now'
      or (p.launch_policy = 'when_stocked' and p.first_stocked_at is not null)
    )
    and not exists (
      select 1 from public.brand_fulfillment_transitions bft
      where bft.brand_id = p.brand_id and bft.status not in ('completed', 'cancelled', 'failed')
    )
  from public.products p
  where p.id = p_product_id;
$$;

revoke all on function private.is_product_customer_visible(text) from public;
grant execute on function private.is_product_customer_visible(text) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Lifecycle transition guard
--
-- Enforced in the database so it holds for every caller, including a
-- service-role client that bypasses the API layer entirely.
-- ----------------------------------------------------------------------------

create or replace function private.enforce_product_lifecycle_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_show_now_override_in_progress boolean :=
    coalesce(current_setting('app.product_show_now_override_in_progress', true), '') = 'on';
  v_pause_in_progress boolean :=
    coalesce(current_setting('app.product_pause_in_progress', true), '') = 'on';
  v_resume_in_progress boolean :=
    coalesce(current_setting('app.product_resume_in_progress', true), '') = 'on';
begin
  -- Paused is never a valid creation state. A product must first complete
  -- the normal Draft -> Published path, then the dedicated pause RPC may
  -- move it to Paused. This closes a direct service-role INSERT bypass.
  if tg_op = 'INSERT' and new.status = 'paused' then
    raise exception 'PRODUCT_PAUSED_REQUIRES_PRIOR_PUBLISH';
  end if;

  -- A live product can never fall back to Draft. Paused is included because
  -- it is a live state that merely isn't currently visible; allowing
  -- paused -> draft would be a silent way around the same rule.
  if tg_op = 'UPDATE' and old.status in ('published', 'paused') and new.status = 'draft' then
    raise exception 'PRODUCT_PUBLISHED_CANNOT_REVERT_TO_DRAFT';
  end if;

  -- Draft may only ever go live through the publish path, never straight to
  -- Paused — that would skip first-publish validation entirely.
  if tg_op = 'UPDATE' and old.status = 'draft' and new.status = 'paused' then
    raise exception 'PRODUCT_DRAFT_CANNOT_PAUSE';
  end if;

  -- Published <-> Paused is a business transition, not an ordinary field
  -- edit. Only the row-locked pause/resume RPCs below may perform it. This
  -- closes the service-role/generic PATCH bypass as well as direct writes.
  if tg_op = 'UPDATE' and old.status = 'published' and new.status = 'paused'
     and not v_pause_in_progress then
    raise exception 'PRODUCT_PAUSE_REQUIRES_RPC';
  end if;
  if tg_op = 'UPDATE' and old.status = 'paused' and new.status = 'published'
     and not v_resume_in_progress then
    raise exception 'PRODUCT_RESUME_REQUIRES_RPC';
  end if;

  -- Launch policy is fixed once live, in either live state.
  if tg_op = 'UPDATE'
     and old.status in ('published', 'paused')
     and new.launch_policy is distinct from old.launch_policy then
    if old.launch_policy = 'when_stocked' and new.launch_policy = 'show_now' then
      if not v_show_now_override_in_progress then
        raise exception 'LAUNCH_POLICY_CHANGE_REQUIRES_SHOW_NOW_RPC';
      end if;
    else
      raise exception 'LAUNCH_POLICY_TRANSITION_NOT_ALLOWED';
    end if;
  end if;

  -- Resume must not re-run the New Arrivals clock. first_visible_at is
  -- stamped once, on first genuine visibility, and never moves afterwards.
  if tg_op = 'UPDATE'
     and old.first_visible_at is not null
     and new.first_visible_at is distinct from old.first_visible_at then
    raise exception 'PRODUCT_FIRST_VISIBLE_AT_IS_IMMUTABLE';
  end if;

  return new;
end;
$$;

drop trigger if exists products_enforce_lifecycle_transition on public.products;
create trigger products_enforce_lifecycle_transition
before insert or update on public.products
for each row execute function private.enforce_product_lifecycle_transition();

revoke all on function private.enforce_product_lifecycle_transition() from public, anon, authenticated;

-- Archived stays terminal for everyone except the dedicated admin restore
-- RPC below, which announces itself with a transaction-local setting. A
-- crafted PATCH or bulk update cannot set that flag — only a SECURITY
-- DEFINER function running as the function owner can.
create or replace function private.enforce_archived_product_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_restore_in_progress boolean :=
    coalesce(current_setting('app.product_restore_in_progress', true), '') = 'on';
  v_archive_in_progress boolean :=
    coalesce(current_setting('app.product_archive_in_progress', true), '') = 'on';
  v_admin_draft_repair boolean :=
    coalesce(current_setting('app.admin_archive_non_pristine_draft', true), '') = 'on';
begin
  if old.status = 'archived' and new.status <> 'archived' then
    if not v_restore_in_progress then
      raise exception 'PRODUCT_ARCHIVED_IS_TERMINAL';
    end if;
    -- Even the sanctioned path may only land on Paused: restoring straight
    -- to Published would put the product back in front of customers without
    -- the owner ever confirming it.
    if new.status <> 'paused' then
      raise exception 'PRODUCT_RESTORE_MUST_TARGET_PAUSED';
    end if;
  end if;

  if old.status <> 'archived' and new.status = 'archived' then
    if old.status in ('published', 'paused') then
      if not v_archive_in_progress then
        raise exception 'PRODUCT_ARCHIVE_REQUIRES_RPC';
      end if;
    elsif old.status = 'draft' then
      -- Narrow recovery for a Draft that already carries durable state.
      -- Only admin_emergency_hide_product may announce this path, and that
      -- RPC re-checks both non-pristine state and temporary blockers while
      -- holding the product/Variant locks.
      if not v_admin_draft_repair then
        raise exception 'PRODUCT_DRAFT_ARCHIVE_REQUIRES_ADMIN_REPAIR_RPC';
      end if;
    else
      raise exception 'PRODUCT_MUST_BE_PUBLISHED_OR_PAUSED_BEFORE_ARCHIVE';
    end if;
    new.archived_at := coalesce(new.archived_at, now());
    new.paused_by_brand := false;
    new.deletion_requested_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists products_enforce_archived_transition on public.products;
create trigger products_enforce_archived_transition
before update of status on public.products
for each row execute function private.enforce_archived_product_transition();

revoke all on function private.enforce_archived_product_transition() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Deletion eligibility
--
-- Rewritten for the delete-first model. Two substantive changes beyond the
-- new status vocabulary:
--
--   * `canDeleteLive` — a Published/Paused product with no immutable history
--     and no temporary blockers is now permanently deletable.
--   * Order evidence is split by what the rows actually mean. The previous
--     version reported one undifferentiated "order line(s)" count; calling a
--     cancelled order a completed sale (or vice versa) is exactly the kind of
--     inaccuracy the owner would act on. Fulfilled, in-flight and cancelled
--     orders are now counted and labelled separately, and refunds are
--     surfaced from payment_attempts.
-- ----------------------------------------------------------------------------

create or replace function private.compute_product_deletion_eligibility(p_product_id text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_product record;
  v_immutable jsonb := '[]'::jsonb;
  v_temporary jsonb := '[]'::jsonb;
  v_restore jsonb := '[]'::jsonb;
  v_count integer;
  v_quantity numeric;
  v_pristine boolean := true;
  v_has_hold boolean := false;
  v_brand_active boolean := false;
  v_open_transition_count integer := 0;
  v_lifecycle text;
begin
  select * into v_product from public.products where id = p_product_id;
  if not found then
    return jsonb_build_object(
      'productId', p_product_id,
      'lifecycle', 'deleted',
      'canArchive', false,
      'canDeleteDraft', false,
      'canDeleteLive', false,
      'canDeleteArchived', false,
      'canRestore', false,
      'mustRetainHistory', false,
      'hasTemporaryBlockers', false,
      'hasActiveHold', false,
      'immutableReasons', '[]'::jsonb,
      'temporaryBlockers', '[]'::jsonb,
      'restoreBlockers', '[]'::jsonb,
      'blockers', jsonb_build_array(jsonb_build_object(
        'code', 'PRODUCT_NOT_FOUND', 'kind', 'temporary',
        'message', 'This product no longer exists.',
        'resolution', 'Refresh the page.', 'count', null,
        'quantity', null, 'href', null
      ))
    );
  end if;

  v_lifecycle := case
    when v_product.status = 'archived' then 'archived'
    when v_product.status = 'paused' then 'paused'
    when v_product.status = 'published' then 'published'
    else 'draft'
  end;

  -- ---- Immutable history -------------------------------------------------

  select count(*) into v_count from public.reviews where product_id = p_product_id;
  if v_count > 0 then
    v_pristine := false;
    v_immutable := private.append_product_deletion_blocker(
      v_immutable, 'PRODUCT_HAS_REVIEWS', 'immutable',
      format('%s customer review(s)', v_count),
      'Reviews are permanent customer history, so the product must be Archived instead.',
      v_count, null, null
    );
  end if;

  -- Genuinely completed sales: the order reached 'fulfilled'.
  select count(*) into v_count
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where (oi.product_id = p_product_id
      or oi.variant_id in (select id from public.product_variants where product_id = p_product_id))
    and o.status = 'fulfilled';
  if v_count > 0 then
    v_pristine := false;
    v_immutable := private.append_product_deletion_blocker(
      v_immutable, 'PRODUCT_HAS_COMPLETED_SALES', 'immutable',
      format('%s completed sale(s)', v_count),
      'Completed sales are permanent financial history, so the product must be Archived instead.',
      v_count, null, '/admin/orders'
    );
  end if;

  -- Orders still moving through fulfilment. Immutable because the customer
  -- already owns the purchase, but named separately so the owner is not told
  -- an in-flight order is a completed sale.
  select count(*) into v_count
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where (oi.product_id = p_product_id
      or oi.variant_id in (select id from public.product_variants where product_id = p_product_id))
    and o.status in ('confirmed', 'preparing', 'ready_for_pickup', 'shipped');
  if v_count > 0 then
    v_pristine := false;
    v_immutable := private.append_product_deletion_blocker(
      v_immutable, 'PRODUCT_HAS_OPEN_ORDERS', 'immutable',
      format('%s order(s) still being fulfilled', v_count),
      'These orders are not finished yet and must keep their product record, so the product must be Archived instead.',
      v_count, null, '/admin/orders'
    );
  end if;

  select count(*) into v_count
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where (oi.product_id = p_product_id
      or oi.variant_id in (select id from public.product_variants where product_id = p_product_id))
    and o.status = 'cancelled';
  if v_count > 0 then
    v_pristine := false;
    v_immutable := private.append_product_deletion_blocker(
      v_immutable, 'PRODUCT_HAS_CANCELLED_ORDERS', 'immutable',
      format('%s cancelled order line(s)', v_count),
      'Cancelled orders stay auditable, so the product must be Archived instead.',
      v_count, null, '/admin/orders'
    );
  end if;

  -- Refunds, reached through the master order the payment paid for. Counted
  -- from payment_attempts.refunded_at, which is the only place a refund is
  -- actually recorded — there is no returns workflow in this system yet, so
  -- no "returns" count is reported rather than inventing one.
  select count(distinct pa.id) into v_count
  from public.payment_attempts pa
  join public.orders o on o.master_order_id = pa.master_order_id
  join public.order_items oi on oi.order_id = o.id
  where pa.refunded_at is not null
    and (oi.product_id = p_product_id
      or oi.variant_id in (select id from public.product_variants where product_id = p_product_id));
  if v_count > 0 then
    v_pristine := false;
    v_immutable := private.append_product_deletion_blocker(
      v_immutable, 'PRODUCT_HAS_REFUNDS', 'immutable',
      format('%s refunded payment(s)', v_count),
      'Refunds are permanent financial records, so the product must be Archived instead.',
      v_count, null, '/admin/payments'
    );
  end if;

  select count(*) into v_count from public.inventory_movements where product_id = p_product_id;
  if v_count > 0 then
    v_pristine := false;
    v_immutable := private.append_product_deletion_blocker(
      v_immutable, 'PRODUCT_HAS_INVENTORY_HISTORY', 'immutable',
      format('%s inventory movement(s)', v_count),
      'Inventory audit history is permanent, so the product must be Archived instead.',
      v_count, null, '/admin/inventory'
    );
  end if;

  select count(*) into v_count
  from public.warehouse_transfer_items wti
  join public.warehouse_transfers wt on wt.id = wti.transfer_id
  where wti.variant_id in (select id from public.product_variants where product_id = p_product_id)
    and wt.status in ('received', 'rejected', 'cancelled');
  if v_count > 0 then
    v_pristine := false;
    v_immutable := private.append_product_deletion_blocker(
      v_immutable, 'PRODUCT_HAS_WAREHOUSE_HISTORY', 'immutable',
      format('%s warehouse document reference(s)', v_count),
      'Warehouse documents are permanent audit records, so the product must be Archived instead.',
      v_count, null, '/admin/warehouse'
    );
  end if;

  -- ---- Temporary blockers ------------------------------------------------

  select coalesce(sum(quantity), 0) into v_quantity
  from public.product_variants where product_id = p_product_id;
  if v_quantity > 0 then
    v_pristine := false;
    v_temporary := private.append_product_deletion_blocker(
      v_temporary, 'PRODUCT_HAS_AVAILABLE_STOCK', 'temporary',
      format('%s sellable unit(s) still in stock', v_quantity),
      'Reduce the available stock to zero, then run the check again.',
      null, v_quantity, '/brand-portal/stock'
    );
  end if;

  -- A Paymob intention can outlive the request that created it. Deleting
  -- its product while payment is still in flight risks a customer being
  -- charged before the webhook discovers that fulfillment is impossible.
  -- Keep this temporary: once the attempt reaches a terminal state (or an
  -- unstarted attempt expires), a fresh preflight can allow deletion.
  select count(*) into v_count
  from public.payment_attempts pa
  where (
      pa.status in ('processing', 'paid', 'reflecting')
      or (pa.status in ('created', 'pending') and pa.expires_at > pg_catalog.now())
    )
    and exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(pa.cart_snapshot) = 'array'
          then pa.cart_snapshot else '[]'::jsonb end
      ) as item
      where item ->> 'productId' = p_product_id
    );
  if v_count > 0 then
    v_pristine := false;
    v_temporary := private.append_product_deletion_blocker(
      v_temporary, 'PRODUCT_HAS_OPEN_PAYMENT_ATTEMPT', 'temporary',
      format('%s card payment attempt(s) still in flight', v_count),
      'Wait for each payment attempt to complete, fail, or expire, then run the check again.',
      v_count, null, '/admin/payments'
    );
  end if;

  select coalesce(sum(brand_stock_quantity), 0) into v_quantity
  from public.product_variants where product_id = p_product_id;
  if v_quantity > 0 then
    v_pristine := false;
    v_temporary := private.append_product_deletion_blocker(
      v_temporary, 'PRODUCT_HAS_BRAND_STOCK', 'temporary',
      format('%s brand-held unit(s) recorded', v_quantity),
      'Complete the related transfer or reconcile brand-held stock, then run the check again.',
      null, v_quantity, '/brand-portal/stock'
    );
  end if;

  select coalesce(sum(
    greatest(wti.requested_qty - coalesce(wti.received_ok_qty, 0)
      - coalesce(wti.damaged_qty, 0) - coalesce(wti.missing_qty, 0), 0)
  ), 0) into v_quantity
  from public.warehouse_transfer_items wti
  join public.warehouse_transfers wt on wt.id = wti.transfer_id
  where wt.status not in ('received', 'rejected', 'cancelled')
    and wti.variant_id in (select id from public.product_variants where product_id = p_product_id);
  if v_quantity > 0 then
    v_pristine := false;
    v_temporary := private.append_product_deletion_blocker(
      v_temporary, 'PRODUCT_HAS_OPEN_WAREHOUSE_DOCUMENT', 'temporary',
      format('%s unit(s) on open warehouse documents', v_quantity),
      'Receive, reject, or cancel those warehouse documents, then run the check again.',
      null, v_quantity, '/brand-portal/warehouse'
    );
  end if;

  select count(*) into v_count
  from public.warehouse_transfer_items wti
  where wti.variant_id in (select id from public.product_variants where product_id = p_product_id)
    and (coalesce(wti.damaged_qty, 0) > 0 or coalesce(wti.missing_qty, 0) > 0)
    and wti.quarantine_resolved_at is null;
  if v_count > 0 then
    v_pristine := false;
    v_temporary := private.append_product_deletion_blocker(
      v_temporary, 'PRODUCT_HAS_UNRESOLVED_QUARANTINE', 'temporary',
      format('%s unresolved warehouse discrepancy line(s)', v_count),
      'Resolve every damaged or missing-stock quarantine item, then run the check again.',
      v_count, null, '/admin/warehouse/quarantine'
    );
  end if;

  select count(*) into v_count
  from public.brand_fulfillment_transitions
  where brand_id = v_product.brand_id
    and status not in ('completed', 'cancelled', 'failed');
  if v_count > 0 then
    v_pristine := false;
    v_temporary := private.append_product_deletion_blocker(
      v_temporary, 'BRAND_HAS_OPEN_FULFILLMENT_TRANSITION', 'temporary',
      'The brand is changing fulfillment mode.',
      'Complete or cancel the fulfillment transition, then run the check again.',
      v_count, null, '/admin/brands'
    );
  end if;

  select exists(
    select 1 from public.product_deletion_holds
    where product_id = p_product_id and status = 'active'
  ) into v_has_hold;
  if v_has_hold then
    v_pristine := false;
    v_temporary := private.append_product_deletion_blocker(
      v_temporary, 'PRODUCT_HAS_ACTIVE_HOLD', 'temporary',
      'An active legal or administrative hold prevents deletion.',
      'An authorized admin must release the hold, then run the check again.',
      null, null, '/admin/products/archived'
    );
  end if;

  -- Restore has a narrower readiness bar than deletion. Compute it here so
  -- the Archived UI never offers an action that the locked restore RPC is
  -- guaranteed to reject, while the RPC still repeats every check.
  select coalesce(is_active, false) into v_brand_active
  from public.brands where id = v_product.brand_id;
  if not coalesce(v_brand_active, false) then
    v_restore := private.append_product_deletion_blocker(
      v_restore, 'BRAND_NOT_ACTIVE', 'temporary',
      'The brand is not active.',
      'Activate the brand before restoring this product.',
      null, null, '/admin/brands'
    );
  end if;

  select count(*) into v_open_transition_count
  from public.brand_fulfillment_transitions
  where brand_id = v_product.brand_id
    and status not in ('completed', 'cancelled', 'failed');
  if v_open_transition_count > 0 then
    v_restore := private.append_product_deletion_blocker(
      v_restore, 'BRAND_HAS_OPEN_FULFILLMENT_TRANSITION', 'temporary',
      'The brand is changing fulfillment mode.',
      'Complete or cancel the fulfillment transition before restoring the product.',
      v_open_transition_count, null, '/admin/brands'
    );
  end if;

  if v_has_hold then
    v_restore := private.append_product_deletion_blocker(
      v_restore, 'PRODUCT_HAS_ACTIVE_HOLD', 'temporary',
      'An active legal or administrative hold prevents restoration.',
      'An authorized admin must release the hold before restoring the product.',
      null, null, '/admin/products/archived'
    );
  end if;

  if v_product.status <> 'draft'
     or v_product.publish_date is not null
     or v_product.first_stocked_at is not null then
    v_pristine := false;
  end if;

  return jsonb_build_object(
    'productId', p_product_id,
    'lifecycle', v_lifecycle,
    -- Archive is now offered only as the fallback for a live product that
    -- genuinely cannot be deleted, never as an ordinary action. Temporary
    -- blockers must still be resolved first so stock, warehouse work, or
    -- an in-flight payment cannot become stranded behind Archived.
    'canArchive', v_product.status in ('published', 'paused')
      and jsonb_array_length(v_immutable) > 0
      and jsonb_array_length(v_temporary) = 0,
    'canDeleteDraft', v_product.status = 'draft' and v_pristine,
    'canDeleteLive', v_product.status in ('published', 'paused')
      and jsonb_array_length(v_immutable) = 0
      and jsonb_array_length(v_temporary) = 0,
    'canDeleteArchived', v_product.status = 'archived'
      and jsonb_array_length(v_immutable) = 0
      and jsonb_array_length(v_temporary) = 0,
    'canRestore', v_product.status = 'archived' and jsonb_array_length(v_restore) = 0,
    'mustRetainHistory', jsonb_array_length(v_immutable) > 0,
    'hasTemporaryBlockers', jsonb_array_length(v_temporary) > 0,
    'hasActiveHold', v_has_hold,
    'immutableReasons', v_immutable,
    'temporaryBlockers', v_temporary,
    'restoreBlockers', v_restore,
    'blockers', v_immutable || v_temporary
  );
end;
$$;

revoke all on function private.compute_product_deletion_eligibility(text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Pause / Resume as canonical, row-locked transitions
-- ----------------------------------------------------------------------------

create or replace function public.pause_product(
  p_product_id text,
  p_brand_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_product record;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'This product no longer exists.');
  end if;
  if p_brand_id is not null and v_product.brand_id <> p_brand_id then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_OWNED', 'message', 'You do not have access to this product.');
  end if;
  -- Idempotent: a double-click gets the same success, not a 409.
  if v_product.status = 'paused' then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_PAUSED', 'message', 'Product is already Paused.',
      'lifecycle', 'paused', 'before', 'paused', 'after', 'paused');
  end if;
  if v_product.status <> 'published' then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_PUBLISHED',
      'message', 'Only a Published product can be paused.');
  end if;

  -- Stock, publish_date, first_visible_at and launch_policy are all left
  -- exactly as they are: pausing hides a product, it does not reset it.
  perform set_config('app.product_pause_in_progress', 'on', true);
  update public.products set status = 'paused' where id = p_product_id;
  perform set_config('app.product_pause_in_progress', 'off', true);

  return jsonb_build_object('ok', true, 'code', 'PRODUCT_PAUSED', 'message', 'Product Paused.',
    'lifecycle', 'paused', 'before', 'published', 'after', 'paused');
end;
$$;

revoke all on function public.pause_product(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.pause_product(text, uuid, uuid) to service_role;

create or replace function public.resume_product(
  p_product_id text,
  p_brand_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product record;
  v_brand record;
  v_variant_count integer;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'This product no longer exists.');
  end if;
  if p_brand_id is not null and v_product.brand_id <> p_brand_id then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_OWNED', 'message', 'You do not have access to this product.');
  end if;
  if v_product.status = 'published' then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_PUBLISHED', 'message', 'Product is already live.',
      'lifecycle', 'published', 'before', 'published', 'after', 'published');
  end if;
  if v_product.status <> 'paused' then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_PAUSED',
      'message', 'Only a Paused product can be resumed.');
  end if;

  -- Revalidate on the way back up: state that was fine when the product was
  -- paused may not be fine now.
  select * into v_brand from public.brands where id = v_product.brand_id;
  if v_brand is null or v_brand.is_active is not true then
    return jsonb_build_object('ok', false, 'code', 'BRAND_NOT_ACTIVE',
      'message', 'This brand is not active, so its products cannot go live.');
  end if;

  if exists (
    select 1 from public.product_deletion_holds
    where product_id = p_product_id and status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_HAS_ACTIVE_HOLD',
      'message', 'An active hold prevents this product from going live.');
  end if;

  -- Serialize the readiness check with updates to existing variants. This
  -- keeps the decision and the status transition in one locked transaction.
  perform id from public.product_variants
  where product_id = p_product_id
  order by id
  for update;
  select count(*) into v_variant_count from public.product_variants
  where product_id = p_product_id
    and coalesce(is_archived, false) = false
    and selling_status = 'active';
  if v_variant_count = 0 then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_HAS_NO_VARIANTS',
      'message', 'Set at least one non-archived variant to Active before resuming this product.');
  end if;

  if nullif(trim(coalesce(v_product.name, '')), '') is null
     or coalesce(v_product.price, 0) <= 0
     or nullif(trim(coalesce(v_product.image, '')), '') is null
     or nullif(trim(coalesce(v_product.description, '')), '') is null
     or v_product.product_type_id is null
     or v_product.audience is null
     or v_product.launch_policy not in ('show_now', 'when_stocked') then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_INCOMPLETE',
      'message', 'Complete the product name, price, image, description, taxonomy, audience, and launch policy before resuming.');
  end if;

  if exists (
    select 1 from public.brand_fulfillment_transitions
    where brand_id = v_product.brand_id and status not in ('completed', 'cancelled', 'failed')
  ) then
    return jsonb_build_object('ok', false, 'code', 'BRAND_HAS_OPEN_FULFILLMENT_TRANSITION',
      'message', 'Finish the brand fulfillment change before resuming this product.');
  end if;

  -- first_visible_at is untouched (and the lifecycle trigger would reject a
  -- change anyway), so resuming never re-qualifies the product as a New
  -- Arrival. Actual visibility still goes through
  -- private.is_product_customer_visible: publish_date and launch policy can
  -- keep it hidden even now.
  perform set_config('app.product_resume_in_progress', 'on', true);
  update public.products set status = 'published' where id = p_product_id;
  perform set_config('app.product_resume_in_progress', 'off', true);

  return jsonb_build_object('ok', true, 'code', 'PRODUCT_RESUMED', 'message', 'Product resumed.',
    'lifecycle', 'published', 'before', 'paused', 'after', 'published',
    'customerVisible', coalesce(private.is_product_customer_visible(p_product_id), false));
end;
$$;

revoke all on function public.resume_product(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.resume_product(text, uuid, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 6. Archive (fallback only) and permanent deletion of a live product
-- ----------------------------------------------------------------------------

-- Accepts Paused as well as Published, and refuses when the product has no
-- immutable history: Archive exists to protect history, so archiving a
-- product that could simply be deleted would leave a permanent shadow record
-- for no reason.
create or replace function public.archive_product(
  p_product_id text,
  p_brand_id uuid,
  p_actor_id uuid,
  p_actor_label text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product record;
  v_eligibility jsonb;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'This product no longer exists.');
  end if;
  if p_brand_id is not null and v_product.brand_id <> p_brand_id then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_OWNED', 'message', 'You do not have access to this product.');
  end if;
  perform id from public.product_variants where product_id = p_product_id for update;

  if v_product.status = 'archived' then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_ARCHIVED', 'message', 'Product is already Archived.', 'lifecycle', 'archived');
  end if;
  if v_product.status not in ('published', 'paused') then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_LIVE',
      'message', 'Only a Published or Paused product can be Archived.');
  end if;

  -- Recomputed inside this locked transaction, not trusted from the dialog.
  v_eligibility := private.compute_product_deletion_eligibility(p_product_id);
  if coalesce((v_eligibility ->> 'mustRetainHistory')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false, 'code', 'ARCHIVE_NOT_REQUIRED',
      'message', 'This product has no permanent history, so it can be deleted rather than Archived.',
      'eligibility', v_eligibility
    );
  end if;
  if coalesce((v_eligibility ->> 'hasTemporaryBlockers')::boolean, false) then
    return jsonb_build_object(
      'ok', false, 'code', 'PRODUCT_ARCHIVE_BLOCKED',
      'message', 'Resolve every temporary blocker before Archiving this product.',
      'blockers', v_eligibility->'temporaryBlockers',
      'eligibility', v_eligibility
    );
  end if;

  perform set_config('app.product_archive_in_progress', 'on', true);
  update public.products
  set status = 'archived', paused_by_brand = false, archived_at = now(), deletion_requested_at = null
  where id = p_product_id;
  perform set_config('app.product_archive_in_progress', 'off', true);

  return jsonb_build_object(
    'ok', true, 'code', 'PRODUCT_ARCHIVED', 'message', 'Product Archived.',
    'lifecycle', 'archived', 'before', to_jsonb(v_product),
    'eligibility', private.compute_product_deletion_eligibility(p_product_id)
  );
end;
$$;

revoke all on function public.archive_product(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.archive_product(text, uuid, uuid, text) to service_role;

-- Preserve the pre-existing repair path for a Draft that is no longer safe
-- to delete. The lifecycle trigger above deliberately keeps this separate
-- from ordinary Archive: only an Admin RPC can use it, pristine Drafts are
-- rejected, and every temporary blocker must be resolved first so stock,
-- warehouse work, or a card payment is never stranded behind Archived.
create or replace function public.admin_emergency_hide_product(
  p_product_id text,
  p_actor_id uuid,
  p_actor_label text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product record;
  v_eligibility jsonb;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object(
      'ok', false, 'code', 'ARCHIVE_REASON_REQUIRED',
      'message', 'A reason is required to Archive this product.'
    );
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;
  if not found then
    return jsonb_build_object(
      'ok', false, 'code', 'PRODUCT_NOT_FOUND',
      'message', 'This product no longer exists.'
    );
  end if;

  perform id from public.product_variants
  where product_id = p_product_id
  order by id
  for update;

  if v_product.status = 'archived' then
    return jsonb_build_object(
      'ok', true, 'code', 'ALREADY_ARCHIVED',
      'message', 'Product is already Archived.', 'lifecycle', 'archived'
    );
  end if;

  if v_product.status in ('published', 'paused') then
    return public.archive_product(p_product_id, null, p_actor_id, p_actor_label);
  end if;
  if v_product.status <> 'draft' then
    return jsonb_build_object(
      'ok', false, 'code', 'INVALID_ARCHIVE_STATE',
      'message', 'Only a Published, Paused, or non-pristine Draft can be Archived.'
    );
  end if;

  v_eligibility := private.compute_product_deletion_eligibility(p_product_id);
  if coalesce((v_eligibility->>'canDeleteDraft')::boolean, false) then
    return jsonb_build_object(
      'ok', false, 'code', 'DRAFT_IS_PRISTINE',
      'message', 'This Draft is pristine and can be permanently deleted instead.'
    );
  end if;
  if coalesce((v_eligibility->>'hasTemporaryBlockers')::boolean, false) then
    return jsonb_build_object(
      'ok', false, 'code', 'PRODUCT_ARCHIVE_BLOCKED',
      'message', 'Resolve every temporary blocker before Archiving this Draft.',
      'blockers', v_eligibility->'temporaryBlockers',
      'eligibility', v_eligibility
    );
  end if;

  perform set_config('app.admin_archive_non_pristine_draft', 'on', true);
  update public.products
  set status = 'archived', paused_by_brand = false,
      archived_at = now(), deletion_requested_at = null
  where id = p_product_id;
  perform set_config('app.admin_archive_non_pristine_draft', 'off', true);

  return jsonb_build_object(
    'ok', true, 'code', 'NON_PRISTINE_DRAFT_ARCHIVED',
    'message', 'The non-pristine Draft was moved to Archived so its durable state is preserved.',
    'lifecycle', 'archived', 'before', to_jsonb(v_product),
    'eligibility', private.compute_product_deletion_eligibility(p_product_id)
  );
end;
$$;

revoke all on function public.admin_emergency_hide_product(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_emergency_hide_product(text, uuid, text, text)
  to service_role;

-- Extend the shared deletion primitive with one semantic expected state:
-- `live`. It accepts the actual locked row only when it is Published or
-- Paused, persists that exact state in history, and treats either state as a
-- valid idempotent replay. Draft/Archived callers keep their original exact
-- behavior. Defining this here is essential: the earlier implementation only
-- accepted Draft/Archived and would reject every delete_live_product call.
create or replace function private.delete_product_permanently(
  p_product_id text,
  p_brand_id uuid,
  p_actor_id uuid,
  p_actor_label text,
  p_reason text,
  p_operation_key text,
  p_expected_state text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_product record;
  v_eligibility jsonb;
  v_existing record;
  v_actual_state text;
  v_queued integer := 0;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_KEY_REQUIRED', 'message', 'A valid operation key is required.');
  end if;

  select * into v_existing
  from public.product_deletion_history
  where product_id_snapshot = p_product_id and operation_key = p_operation_key;
  if found then
    if p_brand_id is not null and v_existing.brand_id <> p_brand_id then
      return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_OWNED', 'message', 'You do not have access to this product.');
    end if;
    if v_existing.deleted_by is distinct from p_actor_id
       or v_existing.reason is distinct from v_reason
       or not (
         v_existing.deleted_from = p_expected_state
         or (p_expected_state = 'live' and v_existing.deleted_from in ('published', 'paused'))
       ) then
      return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT', 'message', 'This operation key was used for a different deletion.');
    end if;
    return jsonb_build_object('ok', true, 'code', 'ALREADY_DELETED', 'message', 'Product was already permanently deleted.', 'lifecycle', 'deleted');
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    -- A concurrent retry may arrive after the first transaction deleted the
    -- product. Re-read durable history after the lock wait and replay the
    -- original result for Published and Paused alike.
    select * into v_existing
    from public.product_deletion_history
    where product_id_snapshot = p_product_id and operation_key = p_operation_key;
    if found then
      if p_brand_id is not null and v_existing.brand_id <> p_brand_id then
        return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_OWNED', 'message', 'You do not have access to this product.');
      end if;
      if v_existing.deleted_by is distinct from p_actor_id
         or v_existing.reason is distinct from v_reason
         or not (
           v_existing.deleted_from = p_expected_state
           or (p_expected_state = 'live' and v_existing.deleted_from in ('published', 'paused'))
         ) then
        return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT', 'message', 'This operation key was used for a different deletion.');
      end if;
      return jsonb_build_object('ok', true, 'code', 'ALREADY_DELETED', 'message', 'Product was already permanently deleted.', 'lifecycle', 'deleted');
    end if;
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'This product no longer exists.');
  end if;

  if p_brand_id is not null and v_product.brand_id <> p_brand_id then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_OWNED', 'message', 'You do not have access to this product.');
  end if;

  perform id from public.product_variants
  where product_id = p_product_id
  order by id
  for update;

  v_actual_state := v_product.status;
  v_eligibility := private.compute_product_deletion_eligibility(p_product_id);
  if p_expected_state = 'draft' then
    if coalesce((v_eligibility->>'canDeleteDraft')::boolean, false) is not true then
      return jsonb_build_object(
        'ok', false, 'code', 'DRAFT_NOT_PRISTINE',
        'message', 'Only a completely pristine Draft can be permanently deleted.',
        'blockers', v_eligibility->'blockers'
      );
    end if;
  elsif p_expected_state = 'archived' then
    if v_actual_state <> 'archived' then
      return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_ARCHIVED', 'message', 'Archive this product before permanent deletion.');
    end if;
    if coalesce((v_eligibility->>'mustRetainHistory')::boolean, false) then
      return jsonb_build_object(
        'ok', false, 'code', 'PRODUCT_MUST_REMAIN_ARCHIVED',
        'message', 'This product has permanent business history and must remain Archived.',
        'blockers', v_eligibility->'immutableReasons'
      );
    end if;
    if coalesce((v_eligibility->>'hasTemporaryBlockers')::boolean, false) then
      return jsonb_build_object(
        'ok', false, 'code', 'PRODUCT_DELETION_BLOCKED',
        'message', 'Resolve every temporary blocker, then run the deletion check again.',
        'blockers', v_eligibility->'temporaryBlockers'
      );
    end if;
  elsif p_expected_state = 'live' then
    if v_actual_state not in ('published', 'paused') then
      return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_LIVE',
        'message', 'Only a Published or Paused product can be deleted through this action.');
    end if;
    if coalesce((v_eligibility->>'canDeleteLive')::boolean, false) is not true then
      return jsonb_build_object(
        'ok', false, 'code', 'PRODUCT_DELETION_BLOCKED',
        'message', case
          when coalesce((v_eligibility->>'mustRetainHistory')::boolean, false)
            then 'This product has permanent business history and must be Archived instead.'
          else 'Resolve every temporary blocker, then run the deletion check again.'
        end,
        'blockers', v_eligibility->'blockers'
      );
    end if;
  else
    return jsonb_build_object('ok', false, 'code', 'INVALID_DELETION_STATE', 'message', 'Invalid deletion state.');
  end if;

  v_queued := private.queue_product_storage_cleanup(p_product_id, p_actor_id);

  insert into public.product_deletion_history (
    product_id_snapshot, product_name_snapshot, product_sku_snapshot,
    product_image_snapshot, brand_id, deleted_from, deleted_by,
    deleted_by_label, reason, eligibility_snapshot, media_jobs_queued,
    operation_key
  ) values (
    v_product.id, v_product.name, v_product.sku, v_product.image,
    v_product.brand_id, v_actual_state, p_actor_id, p_actor_label,
    v_reason, v_eligibility, v_queued, p_operation_key
  );

  delete from public.products where id = p_product_id;
  if not found then
    raise exception 'PRODUCT_DELETE_RACE';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', case
      when p_expected_state = 'draft' then 'DRAFT_DELETED'
      when p_expected_state = 'live' then 'LIVE_PRODUCT_DELETED'
      else 'ARCHIVED_PRODUCT_DELETED'
    end,
    'message', 'Product permanently deleted.',
    'lifecycle', 'deleted',
    'deletedFrom', v_actual_state,
    'before', to_jsonb(v_product),
    'mediaJobsQueued', v_queued
  );
end;
$$;

revoke all on function private.delete_product_permanently(text, uuid, uuid, text, text, text, text)
  from public, anon, authenticated;

-- Permanent deletion straight from Published/Paused. The shared primitive
-- acquires the product lock before choosing the exact state; the wrapper does
-- no unlocked pre-read, which removes the status race and fixes retries of a
-- deletion that originally started from Paused.
create or replace function public.delete_live_product(
  p_product_id text,
  p_brand_id uuid,
  p_actor_id uuid,
  p_actor_label text,
  p_reason text,
  p_operation_key text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.delete_product_permanently(
    p_product_id, p_brand_id, p_actor_id, p_actor_label,
    p_reason, p_operation_key, 'live'
  );
$$;

revoke all on function public.delete_live_product(text, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.delete_live_product(text, uuid, uuid, text, text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 7. Admin-only restore
--
-- The only sanctioned way out of Archived, and it lands on Paused so the
-- product never becomes visible as a side effect of being restored.
-- ----------------------------------------------------------------------------

create table if not exists public.product_restore_history (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  brand_id uuid not null references public.brands(id) on delete restrict,
  restored_by uuid references auth.users(id) on delete set null,
  restored_by_label text not null,
  reason text not null,
  before_status text not null,
  after_status text not null,
  eligibility_snapshot jsonb not null default '{}'::jsonb,
  operation_key text not null,
  restored_at timestamptz not null default now(),
  unique (product_id, operation_key)
);

create index if not exists product_restore_history_product_idx
  on public.product_restore_history (product_id, restored_at desc);

alter table public.product_restore_history enable row level security;
revoke all on public.product_restore_history from public, anon, authenticated;
grant select, insert on public.product_restore_history to service_role;

create or replace function public.admin_restore_archived_product(
  p_product_id text,
  p_actor_id uuid,
  p_actor_label text,
  p_reason text,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product record;
  v_brand record;
  v_existing record;
  v_eligibility jsonb;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_KEY_REQUIRED', 'message', 'A valid operation key is required.');
  end if;
  if v_reason is null then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED', 'message', 'A reason is required to restore an archived product.');
  end if;

  -- Replay of an already-applied restore returns the original outcome.
  select * into v_existing from public.product_restore_history
  where product_id = p_product_id and operation_key = p_operation_key;
  if found then
    if v_existing.restored_by is distinct from p_actor_id or v_existing.reason is distinct from v_reason then
      return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT',
        'message', 'This operation key was used for a different restore.');
    end if;
    return jsonb_build_object('ok', true, 'code', 'ALREADY_RESTORED',
      'message', 'This product was already restored.', 'lifecycle', 'paused');
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'This product no longer exists.');
  end if;

  -- A concurrent request with the same key may have been invisible before
  -- we waited on the product lock. Re-read after the wait so the second
  -- request deterministically replays success instead of reporting that the
  -- now-Paused product is not Archived.
  select * into v_existing from public.product_restore_history
  where product_id = p_product_id and operation_key = p_operation_key;
  if found then
    if v_existing.restored_by is distinct from p_actor_id or v_existing.reason is distinct from v_reason then
      return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT',
        'message', 'This operation key was used for a different restore.');
    end if;
    return jsonb_build_object('ok', true, 'code', 'ALREADY_RESTORED',
      'message', 'This product was already restored.', 'lifecycle', 'paused');
  end if;

  if v_product.status <> 'archived' then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_ARCHIVED',
      'message', 'Only an Archived product can be restored.');
  end if;
  perform id from public.product_variants
  where product_id = p_product_id
  order by id
  for update;

  -- Re-check every restoration requirement inside the lock. Restore lands
  -- on Paused and is deliberately allowed for an incomplete catalog row:
  -- that hidden state is where the owner can repair missing content or add
  -- variants. The stricter resume_product RPC above revalidates the full
  -- publish-ready record before anything can become customer-visible.
  select * into v_brand from public.brands where id = v_product.brand_id;
  if v_brand is null or v_brand.is_active is not true then
    return jsonb_build_object('ok', false, 'code', 'BRAND_NOT_ACTIVE',
      'message', 'This brand is not active, so its products cannot be restored.');
  end if;

  if exists (
    select 1 from public.product_deletion_holds
    where product_id = p_product_id and status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_HAS_ACTIVE_HOLD',
      'message', 'An active legal or administrative hold prevents restoring this product.');
  end if;

  if exists (
    select 1 from public.brand_fulfillment_transitions
    where brand_id = v_product.brand_id and status not in ('completed', 'cancelled', 'failed')
  ) then
    return jsonb_build_object('ok', false, 'code', 'BRAND_HAS_OPEN_FULFILLMENT_TRANSITION',
      'message', 'Finish the brand fulfillment change before restoring this product.');
  end if;

  v_eligibility := private.compute_product_deletion_eligibility(p_product_id);

  -- Announce the sanctioned path to the archived-transition trigger. Set
  -- LOCAL so it cannot leak past this transaction, and only reachable here
  -- because this function runs as its owner.
  perform set_config('app.product_restore_in_progress', 'on', true);
  update public.products
  set status = 'paused', archived_at = null, paused_by_brand = false
  where id = p_product_id;
  perform set_config('app.product_restore_in_progress', 'off', true);

  insert into public.product_restore_history (
    product_id, brand_id, restored_by, restored_by_label, reason,
    before_status, after_status, eligibility_snapshot, operation_key
  ) values (
    p_product_id, v_product.brand_id, p_actor_id, p_actor_label, v_reason,
    'archived', 'paused', v_eligibility, p_operation_key
  );

  return jsonb_build_object(
    'ok', true, 'code', 'PRODUCT_RESTORED',
    'message', 'Product restored to Paused. Resume it when it is ready to sell again.',
    'lifecycle', 'paused', 'before', 'archived', 'after', 'paused'
  );
end;
$$;

revoke all on function public.admin_restore_archived_product(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_restore_archived_product(text, uuid, text, text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 8. Verification
--
-- Fails the migration loudly rather than leaving a half-applied state.
-- ----------------------------------------------------------------------------

do $$
declare v_bad integer;
begin
  select count(*) into v_bad from public.products where paused_by_brand is true;
  if v_bad > 0 then
    raise exception 'Migration guard: % product(s) still carry paused_by_brand = true', v_bad;
  end if;

  select count(*) into v_bad from public.products
  where status not in ('draft', 'pending_review', 'changes_requested', 'published', 'paused', 'archived');
  if v_bad > 0 then
    raise exception 'Migration guard: % product(s) have an unrecognised status', v_bad;
  end if;
end;
$$;
