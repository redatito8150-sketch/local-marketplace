-- ============================================================================
-- Corrective fixes from the 2026-08-20 production security/correctness/
-- reliability audit (docs/audits/2026-08-20-production-security-correctness-
-- reliability-audit-en.md). Each block cites the finding ID it closes.
--
-- Forward-only. Every statement is idempotent (drop-if-exists + create, or a
-- new trigger with no data rewrite) and safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PROD-02 — Archived products can acquire new stock or warehouse requests.
--
-- Two entry points wrote to sellable/brand-held stock without rechecking the
-- parent product's canonical lifecycle status: apply_inventory_adjustments
-- (direct admin/brand adjustment) and request_warehouse_transfer (partner
-- replenishment). Rather than reproduce those two large, already-audited
-- functions by hand (real risk of a transcription error in sensitive
-- inventory code), the guard is enforced once, universally, at the table
-- level — every current and future stock-mutating code path is covered
-- automatically, which is what the finding's own fix recommendation asked
-- for ("every stock/request entry point must lock and recheck canonical
-- parent status").
--
-- Narrow historical-correction exception, as the finding also asked for:
-- a DECREASE in quantity/brand_stock_quantity is still allowed on an
-- Archived product (draining stock to zero, wind-down, write-off) — only an
-- INCREASE is blocked. Corrections live in a separate table
-- (warehouse_corrections / warehouse_correction_lines, not
-- product_variants or warehouse_transfer_items) and are unaffected.
-- Returns (warehouse_transfers.direction = 'to_brand') are also unaffected
-- — sending an Archived product's stock back to the brand doesn't increase
-- anything the storefront can sell.
-- ----------------------------------------------------------------------------

create or replace function private.enforce_archived_product_variant_stock_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_product_status text;
begin
  if new.quantity <= old.quantity and coalesce(new.brand_stock_quantity, 0) <= coalesce(old.brand_stock_quantity, 0) then
    return new;
  end if;
  select status into v_product_status from public.products where id = new.product_id;
  if v_product_status = 'archived' then
    raise exception 'PRODUCT_ARCHIVED_CANNOT_ACQUIRE_STOCK';
  end if;
  return new;
end;
$$;

drop trigger if exists product_variants_enforce_archived_stock_guard on public.product_variants;
create trigger product_variants_enforce_archived_stock_guard
before update of quantity, brand_stock_quantity on public.product_variants
for each row execute function private.enforce_archived_product_variant_stock_guard();

revoke all on function private.enforce_archived_product_variant_stock_guard() from public, anon, authenticated;

create or replace function private.enforce_archived_product_warehouse_item_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_product_status text;
  v_direction text;
begin
  select wt.direction into v_direction from public.warehouse_transfers wt where wt.id = new.transfer_id;
  -- Only an inbound request (stock coming IN to the warehouse) can grow
  -- what the storefront might eventually sell; a return moving stock back
  -- to the brand is a wind-down action, not an acquisition.
  if v_direction is distinct from 'to_local' then
    return new;
  end if;
  select p.status into v_product_status
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  where pv.id = new.variant_id;
  if v_product_status = 'archived' then
    raise exception 'PRODUCT_ARCHIVED_CANNOT_ACQUIRE_STOCK';
  end if;
  return new;
end;
$$;

drop trigger if exists warehouse_transfer_items_enforce_archived_guard on public.warehouse_transfer_items;
create trigger warehouse_transfer_items_enforce_archived_guard
before insert on public.warehouse_transfer_items
for each row execute function private.enforce_archived_product_warehouse_item_guard();

revoke all on function private.enforce_archived_product_warehouse_item_guard() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- DB-04 — A live product could still transition to a pre-live moderation
-- state (pending_review / changes_requested) through a direct/internal
-- write. private.enforce_product_lifecycle_transition() already blocks
-- Published/Paused -> Draft; this closes the two siblings it missed. No
-- normal unprivileged route was found to reach this (the finding calls it a
-- service-role/internal-write backstop gap), so this is defense in depth,
-- not a fix for a currently-reachable bypass.
-- ----------------------------------------------------------------------------

create or replace function private.enforce_product_pre_live_transition_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.status in ('published', 'paused')
     and new.status in ('pending_review', 'changes_requested') then
    raise exception 'PRODUCT_LIVE_CANNOT_REVERT_TO_PRE_LIVE_STATE';
  end if;
  return new;
end;
$$;

drop trigger if exists products_enforce_pre_live_transition_guard on public.products;
create trigger products_enforce_pre_live_transition_guard
before update of status on public.products
for each row execute function private.enforce_product_pre_live_transition_guard();

revoke all on function private.enforce_product_pre_live_transition_guard() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- DB-01 — Deletion preflight misses wrong-Variant and correction references.
--
-- private.compute_product_deletion_eligibility's PRODUCT_HAS_WAREHOUSE_HISTORY
-- check only ever looked at warehouse_transfer_items.variant_id. A Variant
-- that appears ONLY as a receipt substitution (warehouse_receipt_lines.
-- expected_variant_id / actual_variant_id) or a correction's source/target
-- (warehouse_correction_lines.from_variant_id / to_variant_id) — both
-- ON DELETE RESTRICT against product_variants — was invisible to the
-- preflight: eligibility reported the product as safely deletable, but the
-- final delete_product_permanently call would then fail at the database's
-- own FK restrict. Not a security defect (no corruption, no bypass — the
-- restrict still held), but a misleading result and a failed terminal
-- operation. This is the complete function body from
-- 20260819120000_paused_status_and_delete_first_lifecycle.sql with exactly
-- one query widened (the warehouse-history check now also matches receipt
-- and correction line references) — everything else is unchanged.
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

  -- Widened for DB-01: a Variant can carry permanent warehouse history by
  -- appearing ONLY as a receipt's actual/substituted Variant or a
  -- correction's from/to Variant, never in warehouse_transfer_items at all
  -- — both tables hold an ON DELETE RESTRICT reference, so missing them
  -- here let the preflight claim "safe to delete" for a product the
  -- database itself would then refuse to delete.
  select count(*) into v_count
  from public.product_variants pv
  where pv.product_id = p_product_id
    and (
      exists (
        select 1 from public.warehouse_transfer_items wti
        join public.warehouse_transfers wt on wt.id = wti.transfer_id
        where wti.variant_id = pv.id and wt.status in ('received', 'rejected', 'cancelled')
      )
      or exists (
        select 1 from public.warehouse_receipt_lines wrl
        where wrl.expected_variant_id = pv.id or wrl.actual_variant_id = pv.id
      )
      or exists (
        select 1 from public.warehouse_correction_lines wcl
        where wcl.from_variant_id = pv.id or wcl.to_variant_id = pv.id
      )
    );
  if v_count > 0 then
    v_pristine := false;
    v_immutable := private.append_product_deletion_blocker(
      v_immutable, 'PRODUCT_HAS_WAREHOUSE_HISTORY', 'immutable',
      format('%s Variant(s) with warehouse document references', v_count),
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
-- APP-01 — Application deletion is non-transactional and orphans private
-- documents.
--
-- app/api/admin/applications/[id]/route.ts used to run five sequential
-- .delete() calls with no transaction and never collected the underlying
-- Storage paths at all: an intermediate failure left a partially destroyed
-- application, and even a fully successful run permanently orphaned every
-- private legal document in Storage (the metadata pointing at them was
-- gone, but nothing ever queued the objects for removal). This RPC makes
-- the whole delete one Postgres transaction (all-or-nothing) and enqueues
-- every document's storage_path into the existing durable
-- storage_cleanup_jobs registry (lib/account/storageCleanup.ts already
-- drains this via processStorageCleanupJobs on a cron) in the SAME
-- transaction as the row deletes, so a crash between "delete rows" and
-- "queue cleanup" is impossible — either both happened or neither did.
-- ----------------------------------------------------------------------------

create or replace function public.admin_delete_brand_application(
  p_application_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application record;
  v_queued integer := 0;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED', 'message', 'A reason is required to delete an application.');
  end if;

  select * into v_application from public.brand_applications where id = p_application_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'APPLICATION_NOT_FOUND', 'message', 'This application no longer exists.');
  end if;

  -- Queue every document's Storage object for durable cleanup BEFORE the
  -- metadata row that's the only record of its path is deleted below —
  -- still the same transaction, so this cannot partially apply.
  insert into public.storage_cleanup_jobs (owner_user_id, bucket_id, storage_path)
  select v_application.applicant_user_id, 'brand-application-documents', storage_path
  from public.brand_application_documents
  where application_id = p_application_id
  on conflict (bucket_id, storage_path) do nothing;
  get diagnostics v_queued = row_count;

  delete from public.brand_application_revisions where application_id = p_application_id;
  delete from public.brand_application_status_history where application_id = p_application_id;
  delete from public.brand_application_documents where application_id = p_application_id;
  delete from public.brand_application_information_requests where application_id = p_application_id;
  delete from public.brand_applications where id = p_application_id;

  return jsonb_build_object(
    'ok', true, 'code', 'APPLICATION_DELETED', 'message', 'Application permanently deleted.',
    'before', to_jsonb(v_application), 'mediaJobsQueued', v_queued
  );
end;
$$;

revoke all on function public.admin_delete_brand_application(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_delete_brand_application(uuid, uuid, text) to service_role;

-- ----------------------------------------------------------------------------
-- PAY-02 — Account deletion can erase or conflict with payment attempts.
--
-- payment_attempts.user_id was ON DELETE CASCADE from auth.users, while
-- orders.payment_attempt_id and private.payment_webhook_events.
-- payment_attempt_id both reference payment_attempts with no ON DELETE
-- clause at all (default NO ACTION). Two distinct failure modes followed:
--
--   1. Deleting an account with an IN-PROGRESS attempt (created/pending/
--      processing/paid/reflecting) cascade-deleted the one local record of
--      that payment right before a Paymob webhook needs it — captured
--      money with no local trail. The application-level guard added above
--      in app/api/account/delete/route.ts now refuses deletion in this
--      case, which is the primary fix.
--   2. Deleting an account that ever had ANY card payment reach a terminal
--      state (fulfilled, failed, expired, ...) — i.e. any customer who
--      successfully paid by card, ever — would hit a foreign key
--      violation the moment the cascade tried to delete a payment_attempts
--      row still referenced by orders/payment_webhook_events. Account
--      deletion for that customer was simply broken.
--
-- Fix for both, as the finding's own remediation asks for ("preserve and
-- anonymize financial audit rows instead of cascade-deleting them"):
-- payment_attempts.user_id becomes nullable and ON DELETE SET NULL instead
-- of CASCADE, matching the existing pattern already used for
-- orders.user_id. The row — and every order/webhook event that points at
-- it — survives account deletion; only the link to the now-gone customer
-- identity is severed. Existing RLS ("Customers can read their own payment
-- attempts", using user_id = auth.uid()) is unaffected: a null user_id
-- simply matches no one, which is the correct outcome for an anonymized
-- row.
-- ----------------------------------------------------------------------------

alter table public.payment_attempts alter column user_id drop not null;

alter table public.payment_attempts drop constraint if exists payment_attempts_user_id_fkey;
alter table public.payment_attempts
  add constraint payment_attempts_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- ----------------------------------------------------------------------------
-- PAY-09 (part 1) — Manual refund recording never updated orders.payment_status.
--
-- mark_payment_attempt_refund_recorded only ever touched payment_attempts
-- (refunded_at/refund_note/refunded_by). Every order created from that
-- attempt kept payment_status = 'paid' forever, so
-- lib/orders/paymentPresentation.ts and every Admin/customer/brand reader
-- of orders.payment_status kept showing "Paid" after a real refund — and,
-- combined with the PAY-03 fix below, would have permanently blocked
-- cancelling an order that had, in fact, already been refunded. This does
-- not create a new refund obligation/amount schema (that is a larger
-- change the finding itself flags as needing sandbox verification before
-- going live) — it closes the specific, narrower gap of the two records
-- disagreeing about whether a refund happened at all.
-- ----------------------------------------------------------------------------

create or replace function public.mark_payment_attempt_refund_recorded(
  p_payment_attempt_id uuid,
  p_actor_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt record;
  v_updated_orders integer := 0;
begin
  select * into v_attempt from public.payment_attempts where id = p_payment_attempt_id for update;
  if not found then
    raise exception 'PAYMENT_ATTEMPT_NOT_FOUND';
  end if;

  if v_attempt.refunded_at is not null then
    raise exception 'ALREADY_MARKED_REFUNDED';
  end if;

  if v_attempt.status not in ('fulfillment_failed', 'fulfilled') then
    raise exception 'PAYMENT_ATTEMPT_NOT_REFUND_ELIGIBLE: status is %', v_attempt.status;
  end if;

  update public.payment_attempts
  set refunded_at = now(),
      refund_note = p_note,
      refunded_by = p_actor_id,
      updated_at = now()
  where id = p_payment_attempt_id;

  -- Keep every order this attempt paid for in agreement with the attempt
  -- itself. A cancelled order's payment_status is left alone — cancelling
  -- doesn't erase the payment history of what was, until refunded, a real
  -- paid order.
  update public.orders
  set payment_status = 'refunded'
  where master_order_id = v_attempt.master_order_id
    and payment_status = 'paid';
  get diagnostics v_updated_orders = row_count;

  return jsonb_build_object(
    'payment_attempt_id', p_payment_attempt_id, 'refunded_at', now(), 'ordersUpdated', v_updated_orders
  );
end;
$$;

revoke all on function public.mark_payment_attempt_refund_recorded(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.mark_payment_attempt_refund_recorded(uuid, uuid, text) to service_role;

-- ----------------------------------------------------------------------------
-- PAY-03 — Paid card cancellation has no refund obligation.
--
-- cancel_order (the shared low-level RPC every cancellation surface —
-- Admin single-order, Admin master-order, Brand Portal, and the customer's
-- own cancel_customer_master_order — ultimately calls) had no awareness of
-- payment_method/payment_status at all: it always restocked and cancelled.
-- cancel_customer_master_order already wrapped it with the correct checks
-- (CARD_ORDER_REQUIRES_REFUND_REVIEW / PAID_ORDER_REQUIRES_REFUND_REVIEW)
-- for the customer's own self-service path, but Admin and Brand Portal
-- called cancel_order directly, bypassing them — an Admin or Brand Owner
-- could cancel and restock a captured, un-refunded card order with the
-- customer still charged and no refund obligation ever created.
--
-- Fix: the same check, moved into cancel_order itself so every caller gets
-- it, not just the customer path. Deliberately narrower than the
-- customer's own rule — a card order that was NEVER captured
-- (payment_status = 'unpaid', e.g. an abandoned Paymob checkout) or one
-- that has already gone through mark-refunded above (payment_status =
-- 'refunded') can still be cancelled by staff; only an order still sitting
-- at payment_status = 'paid' with a non-COD payment_method is rejected,
-- which is exactly the "customer is charged, stock about to be released
-- for resale, no refund on record" case the finding describes.
-- ----------------------------------------------------------------------------

create or replace function public.cancel_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_payment_method text;
  v_payment_status text;
  v_group_id uuid;
  v_item record;
  v_restocked integer := 0;
  v_released_coupon text;
begin
  select master_order_id into v_group_id
  from public.orders
  where id = p_order_id;

  if v_group_id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_group_id::text, 0)
  );

  select status, payment_method, payment_status
    into v_status, v_payment_method, v_payment_status
  from public.orders
  where id = p_order_id
  for update;

  if v_status = 'cancelled' then raise exception 'ALREADY_CANCELLED'; end if;
  if v_status = 'shipped' then raise exception 'CANNOT_CANCEL_SHIPPED'; end if;
  if v_status = 'fulfilled' then raise exception 'CANNOT_CANCEL_FULFILLED'; end if;
  if v_payment_method <> 'cash_on_delivery' and v_payment_status = 'paid' then
    raise exception 'PAID_ORDER_REQUIRES_REFUND_REVIEW';
  end if;

  for v_item in
    select oi.variant_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id and oi.variant_id is not null
  loop
    if v_item.quantity <= 0 then raise exception 'INVALID_ORDER_ITEM_QUANTITY'; end if;
    update public.product_variants
    set quantity = quantity + v_item.quantity, updated_at = now()
    where id = v_item.variant_id;
    v_restocked := v_restocked + 1;
  end loop;

  update public.orders set status = 'cancelled' where id = p_order_id;
  insert into public.order_status_history (order_id, status, note)
  values (p_order_id, 'cancelled', null);

  if not exists (
    select 1 from public.orders sibling
    where sibling.master_order_id = v_group_id
      and sibling.status <> 'cancelled'
  ) then
    update private.coupon_redemptions
    set released_at = now()
    where master_order_id = v_group_id
      and released_at is null
    returning coupon_code into v_released_coupon;

    if v_released_coupon is not null then
      update public.coupons
      set used_count = used_count - 1
      where code = v_released_coupon and used_count > 0;
    end if;
  end if;

  return jsonb_build_object(
    'order_id', p_order_id,
    'restocked_variants', v_restocked,
    'coupon_released', v_released_coupon is not null
  );
end;
$$;

revoke all on function public.cancel_order(uuid) from public, anon, authenticated;
grant execute on function public.cancel_order(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- PAY-06 — Card coupon usage is raceable.
--
-- Coupon availability was only ever checked in application code
-- (app/api/payments/paymob/intention/route.ts,
-- lib/payments/createIntentionForCart.ts) against coupons.used_count, which
-- is only incremented once an attempt is later fulfilled
-- (place_paid_order, ~2500 lines into 20260815213740_...sql). Two
-- concurrent card intentions for a coupon with one remaining use would both
-- read used_count < max_uses and both proceed — used_count alone cannot
-- see a payment that's merely "in flight." COD's own place_order already
-- reserves correctly (locks the coupons row and increments used_count
-- synchronously, in the same transaction as order placement), because a
-- COD order has no equivalent in-flight window.
--
-- Rather than hand-edit place_paid_order or place_order to change their
-- coupon accounting — both are large (300+ line), extensively tested
-- financial fulfillment functions, and this migration deliberately doesn't
-- retype either by hand given the risk of a transcription error in code
-- that size — this closes the race with a separate, additive reservation
-- ledger. A row here exists exactly as long as its payment_attempt is
-- non-terminal; the moment the attempt reaches any terminal status
-- (however that happens — decline, expiry, successful fulfillment, or a
-- future retry path), the reservation stops counting on its own, with no
-- release step required anywhere else in the codebase. On success,
-- coupons.used_count itself increments as it always has (place_paid_order
-- is unchanged) and the now-terminal reservation simultaneously drops out
-- of the active count — the two mechanisms hand off with no double-count
-- window and no gap.
--
-- Scope: this closes the confirmed card-vs-card race specifically named by
-- the finding. It does not additionally teach place_order (COD) to count
-- outstanding card reservations against max_uses — that would require
-- hand-editing that same large function and is a narrower, lower-severity
-- gap (a COD order racing an in-flight card intention) than the one this
-- finding reports.
-- ----------------------------------------------------------------------------

create table if not exists private.coupon_reservations (
  id uuid primary key default gen_random_uuid(),
  coupon_code text not null,
  payment_attempt_id uuid not null references public.payment_attempts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (payment_attempt_id)
);

create index if not exists coupon_reservations_code_idx on private.coupon_reservations (coupon_code);

alter table private.coupon_reservations enable row level security;
revoke all on private.coupon_reservations from public, anon, authenticated;
grant select, insert on private.coupon_reservations to service_role;

create or replace function public.create_payment_attempt(
  p_user_id uuid,
  p_idempotency_actor text,
  p_client_request_id uuid,
  p_request_hash text,
  p_amount_cents integer,
  p_currency text,
  p_cart_snapshot jsonb,
  p_shipping_snapshot jsonb,
  p_coupon_snapshot jsonb default null,
  p_expires_in_seconds integer default 3600
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_special_reference text;
  v_existing record;
  v_brand_id uuid;
  v_coupon_code text;
  v_coupon record;
  v_active_reservations integer;
begin
  if p_user_id is null then raise exception 'INVALID_USER'; end if;
  if p_idempotency_actor is null or p_idempotency_actor !~ '^user:' then
    raise exception 'INVALID_IDEMPOTENCY_ACTOR';
  end if;
  if p_client_request_id is null then raise exception 'INVALID_CLIENT_REQUEST_ID'; end if;
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_REQUEST_HASH';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_currency is distinct from 'EGP' then raise exception 'INVALID_CURRENCY'; end if;
  if p_expires_in_seconds is null or p_expires_in_seconds < 300 or p_expires_in_seconds > 86400 then
    raise exception 'INVALID_EXPIRY';
  end if;
  if pg_catalog.jsonb_typeof(p_cart_snapshot) <> 'array'
     or pg_catalog.jsonb_array_length(p_cart_snapshot) = 0 then
    raise exception 'INVALID_CART_SNAPSHOT';
  end if;

  -- A completed replay never creates a new provider intention, so it can be
  -- returned before taking inventory/transition locks.
  select id, special_reference, status, request_hash into v_existing
  from public.payment_attempts
  where idempotency_actor = p_idempotency_actor
    and client_request_id = p_client_request_id;

  if v_existing.id is not null then
    if v_existing.request_hash <> p_request_hash then
      raise exception 'IDEMPOTENCY_CONFLICT: key belongs to a different request';
    end if;
    return pg_catalog.jsonb_build_object(
      'payment_attempt_id', v_existing.id,
      'special_reference', v_existing.special_reference,
      'status', v_existing.status,
      'replayed', true
    );
  end if;

  -- Lock every cart brand in a deterministic order. A concurrent transition
  -- locks the same row, so one transaction must finish before the other can
  -- decide whether payment/transition is permitted.
  for v_brand_id in
    select b.id
    from public.brands b
    where b.slug in (
      select distinct nullif(item ->> 'brandSlug', '')
      from pg_catalog.jsonb_array_elements(p_cart_snapshot) as item
    )
    order by b.id
    for update of b
  loop
    null;
  end loop;

  if exists (
    select 1
    from public.brand_fulfillment_transitions bft
    join public.brands b on b.id = bft.brand_id
    where b.slug in (
      select distinct nullif(item ->> 'brandSlug', '')
      from pg_catalog.jsonb_array_elements(p_cart_snapshot) as item
    )
      and bft.status not in ('completed', 'cancelled', 'failed')
  ) then
    raise exception 'FULFILLMENT_TRANSITION_BLOCKS_PAYMENT';
  end if;

  -- CORRECTIVE PASS: locks every product/variant this cart references and
  -- rechecks canonical visibility, inside this same transaction,
  -- immediately before the attempt is created -- the last DB-side gate
  -- before the caller makes the external Paymob API call.
  perform private.lock_and_verify_intention_cart_visibility(p_cart_snapshot);

  -- PAY-06: atomically reserve the coupon, if one was applied, before the
  -- attempt row (and therefore the reservation's own FK target) exists.
  -- Locking the coupons row serializes this against every other concurrent
  -- create_payment_attempt call for the same code, and against COD's
  -- place_order, which locks the same row.
  v_coupon_code := nullif(p_coupon_snapshot ->> 'code', '');
  if v_coupon_code is not null then
    select * into v_coupon from public.coupons where code = v_coupon_code for update;
    if v_coupon.code is not null and v_coupon.max_uses is not null then
      select count(*) into v_active_reservations
      from private.coupon_reservations cr
      join public.payment_attempts pa on pa.id = cr.payment_attempt_id
      where cr.coupon_code = v_coupon_code
        and pa.status in ('created', 'pending', 'processing', 'paid', 'reflecting');
      if v_coupon.used_count + v_active_reservations >= v_coupon.max_uses then
        raise exception 'COUPON_LIMIT_REACHED';
      end if;
    end if;
  end if;

  v_id := pg_catalog.gen_random_uuid();
  v_special_reference := 'mahaly_' || v_id::text;

  begin
    insert into public.payment_attempts (
      id, user_id, special_reference, idempotency_actor, client_request_id,
      request_hash, amount_cents, currency, cart_snapshot, shipping_snapshot,
      coupon_snapshot, expires_at
    ) values (
      v_id, p_user_id, v_special_reference, p_idempotency_actor, p_client_request_id,
      p_request_hash, p_amount_cents, p_currency, p_cart_snapshot, p_shipping_snapshot,
      p_coupon_snapshot, pg_catalog.now() + pg_catalog.make_interval(secs => p_expires_in_seconds)
    );
  exception when unique_violation then
    select id, special_reference, status, request_hash into v_existing
    from public.payment_attempts
    where idempotency_actor = p_idempotency_actor
      and client_request_id = p_client_request_id;

    if v_existing.id is null then raise; end if;
    if v_existing.request_hash <> p_request_hash then
      raise exception 'IDEMPOTENCY_CONFLICT: key belongs to a different request';
    end if;
    return pg_catalog.jsonb_build_object(
      'payment_attempt_id', v_existing.id,
      'special_reference', v_existing.special_reference,
      'status', v_existing.status,
      'replayed', true
    );
  end;

  if v_coupon_code is not null then
    insert into private.coupon_reservations (coupon_code, payment_attempt_id)
    values (v_coupon_code, v_id)
    on conflict (payment_attempt_id) do nothing;
  end if;

  return pg_catalog.jsonb_build_object(
    'payment_attempt_id', v_id,
    'special_reference', v_special_reference,
    'status', 'created',
    'replayed', false
  );
end;
$$;

revoke all on function public.create_payment_attempt(uuid, text, uuid, text, integer, text, jsonb, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.create_payment_attempt(uuid, text, uuid, text, integer, text, jsonb, jsonb, jsonb, integer) to service_role;
