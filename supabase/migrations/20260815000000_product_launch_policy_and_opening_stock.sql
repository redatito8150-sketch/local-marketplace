-- ============================================================================
-- Product launch policy + real opening stock.
--
-- Three things this migration changes, all at the database boundary (not
-- just the UI):
--
-- 1. Product creation stops being able to set live stock at all.
--    create_variant_with_opening_stock keeps its exact signature (old/stale
--    clients that still submit p_opening_stock are silently ignored, never
--    trusted) but now always inserts quantity = 0 and never writes a fake
--    zero-unit 'opening_balance' inventory_movements row — there is nothing
--    real to record yet.
--
-- 2. "Opening stock" becomes a real, database-recognized event: the FIRST
--    genuine positive stock a variant ever receives, through exactly one of
--    the two canonical paths (a direct brand's apply_inventory_adjustments,
--    or a partner brand's warehouse receipt via
--    receive_warehouse_document_canonical). Both are extended (same
--    signatures, additive body change, the established convention in this
--    repo) to: (a) tag the specific inventory_movements row with a new
--    is_opening_stock boolean the moment it happens — preserving the row's
--    real movement_type/source (manual_adjustment / admin_correction /
--    warehouse_transfer_received) rather than overloading it, and (b) stamp
--    products.first_stocked_at (unchanged column/meaning from the prior
--    pass) the first time any of a product's variants gets real stock. Both
--    checks happen under the variant's own row lock (already `for update`
--    in both functions), so two concurrent first-stock operations can never
--    both win — is_opening_stock is only ever true once per variant,
--    checked-then-set inside the same lock.
--
--    This migration ALSO fixes a real regression found during the audit for
--    this pass: 20260814010500_partner_replenishment_request.sql's
--    re-declaration of receive_warehouse_document_canonical silently
--    dropped the private.mark_product_first_stocked() call that
--    20260814000004_product_launch_state.sql had added — as currently
--    deployed, a partner brand's first accepted warehouse receipt does NOT
--    stamp first_stocked_at at all, so a when_stocked partner product could
--    never actually launch. This migration restores that stamp (inline,
--    replacing the now-dead mark_product_first_stocked helper) as part of
--    the same re-declaration.
--
-- 3. A new, explicit, database-authoritative launch policy
--    (products.launch_policy: 'show_now' | 'when_stocked') replaces the
--    implicit "zakhnook_fulfilled brands wait for stock, brand_fulfilled
--    brands don't" rule the old is_product_storefront_launch_gated() baked
--    in by reading brands.fulfillment_mode directly. Both fulfillment modes
--    can now choose either policy. The full customer-visibility rule —
--    status/paused/publish_date/brand-active/launch-policy/open-transition
--    — is centralized into ONE new function,
--    private.is_product_customer_visible(product_id), reused by the
--    products RLS policy, the storefront_products view, AND (new in this
--    pass) the order_items availability trigger — closing the gap where
--    COD/card checkout's DB-level defense only ever checked status/paused,
--    never publish_date/brand-active/launch-policy/open-transition (those
--    were previously API-layer-only, duplicated by hand in two files).
--
--    products.first_visible_at (new) is the immutable "first time a real
--    customer could actually see this product" timestamp — distinct from
--    publish_date (which can be hidden behind when_stocked) and from
--    first_stocked_at (a launch precondition, not visibility itself).
--    Stamped by private.stamp_product_first_visible_if_eligible(), called
--    from every place that can newly satisfy the visibility rule (publish,
--    first stock arriving via either canonical path, resume-from-pause, the
--    new explicit "Show now" override) and, as a safety net for the one
--    case with no natural write to hook — a scheduled publish_date simply
--    elapsing with no other event — by a new hourly cron
--    (app/api/cron/activate-product-visibility, matching the existing
--    storage-cleanup cron's CRON_SECRET pattern).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. New columns.
-- ----------------------------------------------------------------------------

alter table public.products
  add column if not exists launch_policy text not null default 'show_now';
alter table public.products drop constraint if exists products_launch_policy_check;
alter table public.products add constraint products_launch_policy_check
  check (launch_policy in ('show_now', 'when_stocked'));

alter table public.products add column if not exists first_visible_at timestamptz;
create index if not exists products_first_visible_at_idx on public.products (first_visible_at);

alter table public.inventory_movements
  add column if not exists is_opening_stock boolean not null default false;
create index if not exists inventory_movements_opening_stock_idx
  on public.inventory_movements (variant_id)
  where is_opening_stock;

grant select (launch_policy, first_visible_at) on public.products to anon, authenticated;

comment on column public.products.launch_policy is
  'Database-authoritative publish-time choice: show_now (visible to customers even at 0 stock, with Notify Me) or when_stocked (internally published, hidden from every customer-facing surface until first_stocked_at is set). Never overloads paused_by_brand/status/fulfillment_mode — see private.is_product_customer_visible().';
comment on column public.products.first_visible_at is
  'Immutable — set once, the first moment this product actually became visible to a real customer (after any publish_date, and after the stock gate for when_stocked). Never cleared or rewritten by Pause/Resume. Existing-data backfilled below; going forward only private.stamp_product_first_visible_if_eligible() may set it.';
comment on column public.inventory_movements.is_opening_stock is
  'True on exactly one row per variant: the first genuine positive-stock movement it ever received (a direct apply_inventory_adjustments add, or a partner receive_warehouse_document_canonical receipt). The movement''s own movement_type/source is preserved unchanged — this is an additive marker, not a re-classification. Never set by product creation, which no longer creates any movement row at all.';

-- ----------------------------------------------------------------------------
-- 2. Backfill — existing data, never mutated destructively.
-- ----------------------------------------------------------------------------

-- Preserves the OLD implicit gate exactly: every zakhnook_fulfilled brand's
-- product becomes when_stocked (a product that already has first_stocked_at
-- set stays immediately visible under the new rule too; one that doesn't
-- stays hidden, exactly as before). brand_fulfilled brands keep the
-- column's own default (show_now), matching their current unconditional
-- visibility — this single UPDATE is the entire compatibility bridge
-- between the old fulfillment_mode-keyed gate and the new explicit column.
update public.products p
set launch_policy = 'when_stocked'
from public.brands b
where b.id = p.brand_id and b.fulfillment_mode = 'zakhnook_fulfilled';

-- Best-effort first_visible_at for products that are ALREADY visible today
-- — never a fabricated future date (least(now(), ...)), never touching a
-- row that isn't currently visible (a when_stocked product with no stock
-- yet correctly gets no backfilled date at all — it will be stamped for
-- real once it actually launches). Uses publish_date as the closest honest
-- approximation of "when this became visible" (falling back to created_at
-- for the rare published row with no publish_date); New Arrivals' 20-day
-- window is a moving window, not a one-time classification, so it
-- self-corrects for anything this slightly under/over-estimates.
update public.products p
set first_visible_at = least(now(), coalesce(p.publish_date, p.created_at))
where p.first_visible_at is null
  and p.status = 'published'
  and coalesce(p.paused_by_brand, false) = false
  and (p.publish_date is null or p.publish_date <= now())
  and exists (select 1 from public.brands b where b.id = p.brand_id and b.is_active = true)
  and (
    p.launch_policy = 'show_now'
    or (p.launch_policy = 'when_stocked' and p.first_stocked_at is not null)
  )
  and not exists (
    select 1 from public.brand_fulfillment_transitions bft
    where bft.brand_id = p.brand_id and bft.status not in ('completed', 'cancelled', 'failed')
  );

-- ----------------------------------------------------------------------------
-- 3. The one canonical customer-visibility predicate.
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
    and coalesce(p.paused_by_brand, false) = false
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

-- SECURITY DEFINER, same reasoning as the function it supersedes
-- (is_product_storefront_launch_gated, left in place below, unreferenced —
-- see that section's note): brand_fulfillment_transitions has no public
-- read policy, so an invoker-rights evaluation as anon/authenticated would
-- have every transition row silently filtered out by RLS, always returning
-- "no open transition" and defeating the check. Returns only a single
-- boolean either way — no row data is exposed to the caller.
revoke all on function private.is_product_customer_visible(text) from public;
grant execute on function private.is_product_customer_visible(text) to anon, authenticated, service_role;

-- Public wrapper — private.* functions aren't PostgREST-exposed, so
-- server-side TS code that needs this same predicate directly (rather than
-- via the RLS policy/view, which call the private function internally)
-- calls this instead. Used by lib/backInStock.ts's checkAndNotifyRestock,
-- which must never send a restock notification while the product itself
-- is paused, archived, its brand inactive, its publish_date still future,
-- a fulfillment transition is open, or its launch policy hasn't been
-- satisfied yet.
create or replace function public.is_product_customer_visible(p_product_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.is_product_customer_visible(p_product_id), false);
$$;

revoke all on function public.is_product_customer_visible(text) from public, anon, authenticated;
grant execute on function public.is_product_customer_visible(text) to service_role;

-- private.is_product_storefront_launch_gated(uuid, timestamptz) (defined in
-- 20260814000006_storefront_launch_gate_view.sql) is superseded by the
-- function above and no longer referenced by the RLS policy or the view
-- (both re-declared below) — left in place, unused, rather than dropped,
-- since dropping it is unnecessary risk for zero benefit (confirmed via
-- repo-wide grep: it had exactly two callers, both being re-declared here).

drop policy if exists "Public can read published products" on public.products;
create policy "Public can read published products"
  on public.products for select
  to anon, authenticated
  using (private.is_product_customer_visible(products.id));

create or replace view public.storefront_products
with (security_invoker = true)
as
select
  p.id, p.name, p.brand_name, p.brand_slug, p.brand_id, p.product_type_id,
  p.audience, p.collection_id, p.material, p.materials, p.fit, p.price,
  p.discount_percent, p.discount_ends_at, p.currency, p.image, p.images,
  p.rating, p.review_count, p.description, p.details, p.care_instructions,
  p.shipping_returns, p.model_height, p.model_wearing, p.sku, p.is_new,
  p.featured, p.status, p.publish_date, p.paused_by_brand,
  p.default_low_stock_threshold, p.created_at, p.first_stocked_at,
  p.launch_policy, p.first_visible_at
from public.products p
where private.is_product_customer_visible(p.id);

grant select on public.storefront_products to anon, authenticated, service_role;

-- The order_items availability trigger previously only checked
-- status/paused_by_brand — publish_date, brand-active, launch-policy, and
-- open-transition were API-layer-only (app/api/orders/route.ts,
-- lib/payments/intentionCart.ts), duplicated by hand. Re-declared to reuse
-- the one canonical predicate, so a service-role caller that bypasses the
-- API layer entirely can no longer insert an order_items row for a product
-- that isn't actually customer-visible right now.
create or replace function private.enforce_order_item_product_available()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_product_id text;
begin
  v_product_id := new.product_id;
  if v_product_id is null and new.variant_id is not null then
    select product_id into v_product_id from public.product_variants where id = new.variant_id;
  end if;
  if v_product_id is null then
    return new;
  end if;
  if not coalesce(private.is_product_customer_visible(v_product_id), false) then
    raise exception 'PRODUCT_NOT_AVAILABLE_FOR_ORDER';
  end if;
  return new;
end;
$$;

drop trigger if exists order_items_enforce_product_available on public.order_items;
create trigger order_items_enforce_product_available
before insert on public.order_items
for each row execute function private.enforce_order_item_product_available();

revoke all on function private.enforce_order_item_product_available() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. first_visible_at stamping — the single place eligibility is checked
--    and the timestamp is set, reused by every event that can newly make a
--    product visible.
-- ----------------------------------------------------------------------------

create or replace function private.stamp_product_first_visible_if_eligible(p_product_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The UPDATE's own WHERE clause both takes the row lock and re-checks
  -- eligibility at that exact moment — no separate SELECT ... FOR UPDATE
  -- needed. Idempotent (first_visible_at is null guard), so calling this
  -- from several different write paths for the same product is always
  -- safe, and it is a pure no-op whenever the product isn't eligible yet.
  update public.products
  set first_visible_at = now()
  where id = p_product_id
    and first_visible_at is null
    and private.is_product_customer_visible(p_product_id);
end;
$$;

revoke all on function private.stamp_product_first_visible_if_eligible(text) from public, anon, authenticated, service_role;

-- Public wrapper — private.* functions aren't PostgREST-exposed, so the
-- product create/update API routes (and anything else outside this
-- migration's own SQL) call this instead. apply_inventory_adjustments and
-- receive_warehouse_document_canonical call the private function directly,
-- same-transaction, since they're already inside plpgsql.
create or replace function public.stamp_product_first_visible_if_eligible(p_product_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.stamp_product_first_visible_if_eligible(p_product_id);
$$;

revoke all on function public.stamp_product_first_visible_if_eligible(text) from public, anon, authenticated;
grant execute on function public.stamp_product_first_visible_if_eligible(text) to service_role;

-- Safety-net cron target for the one case with no natural write to hook: a
-- when_stocked product that already has stock, or a show_now product, whose
-- only remaining blocker was a future publish_date simply elapsing. Every
-- other transition (first stock arriving, publish, resume, explicit "Show
-- now") stamps inline at the moment it happens — this exists purely to
-- catch scheduled-date elapse and as a general backstop.
create or replace function private.execute_scheduled_product_visibility_activation(p_batch_size integer default 100)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row record;
  v_checked integer := 0;
  v_activated integer := 0;
begin
  for v_row in
    select id from public.products
    where first_visible_at is null
      and status = 'published'
      and coalesce(paused_by_brand, false) = false
      and (publish_date is null or publish_date <= now())
    order by publish_date nulls first, created_at
    limit greatest(1, least(coalesce(p_batch_size, 100), 500))
    for update skip locked
  loop
    v_checked := v_checked + 1;
    if private.is_product_customer_visible(v_row.id) then
      update public.products set first_visible_at = now() where id = v_row.id and first_visible_at is null;
      v_activated := v_activated + 1;
    end if;
  end loop;
  return jsonb_build_object('checked', v_checked, 'activated', v_activated);
end;
$$;

revoke all on function private.execute_scheduled_product_visibility_activation(integer) from public, anon, authenticated, service_role;

create or replace function public.execute_scheduled_product_visibility_activation(p_batch_size integer default 100)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.execute_scheduled_product_visibility_activation(p_batch_size);
$$;

revoke all on function public.execute_scheduled_product_visibility_activation(integer) from public, anon, authenticated;
grant execute on function public.execute_scheduled_product_visibility_activation(integer) to service_role;

-- ----------------------------------------------------------------------------
-- 5. Product creation is catalog-only: create_variant_with_opening_stock
--    keeps its exact signature (old/stale clients that still submit
--    p_opening_stock are safely ignored, never trusted) but always inserts
--    quantity = 0 and never writes an inventory_movements row.
-- ----------------------------------------------------------------------------

create or replace function public.create_variant_with_opening_stock(
  p_product_id text,
  p_sku text,
  p_combo_key text,
  p_opening_stock integer,
  p_variant_price numeric,
  p_variant_discount_percent numeric,
  p_low_stock_threshold_override integer,
  p_selling_status text,
  p_option_value_ids uuid[],
  p_actor_id uuid,
  p_operation_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_variant_id uuid;
  v_brand_id uuid;
begin
  -- p_opening_stock, p_actor_id, p_operation_key are accepted only for
  -- signature compatibility with existing callers/old clients — none of
  -- them are read below. Every newly created variant starts at live
  -- quantity 0 unconditionally, regardless of what a caller submits, and no
  -- inventory_movements row is created here at all: there is nothing real
  -- to record until Inventory (apply_inventory_adjustments) or a warehouse
  -- receipt (receive_warehouse_document_canonical) adds genuine stock —
  -- whichever happens first is this variant's real opening-stock event.
  select brand_id into v_brand_id
  from public.products where id = p_product_id for update;
  if v_brand_id is null then raise exception 'Product not found'; end if;

  select id into v_variant_id
  from public.product_variants
  where product_id = p_product_id and combo_key = p_combo_key
  order by is_archived asc, created_at asc
  limit 1;

  if v_variant_id is not null then
    return v_variant_id;
  end if;

  insert into public.product_variants (
    product_id, sku, quantity, variant_price, variant_discount_percent,
    low_stock_threshold_override, selling_status, combo_key
  ) values (
    p_product_id, p_sku, 0, p_variant_price, p_variant_discount_percent,
    p_low_stock_threshold_override, p_selling_status, p_combo_key
  ) returning id into v_variant_id;

  if coalesce(array_length(p_option_value_ids, 1), 0) > 0 then
    insert into public.product_variant_values (variant_id, option_value_id)
    select v_variant_id, unnest(p_option_value_ids);
  end if;

  return v_variant_id;
end;
$$;

revoke all on function public.create_variant_with_opening_stock(
  text,text,text,integer,numeric,numeric,integer,text,uuid[],uuid,text
) from public, anon, authenticated;
grant execute on function public.create_variant_with_opening_stock(
  text,text,text,integer,numeric,numeric,integer,text,uuid[],uuid,text
) to service_role;

-- ----------------------------------------------------------------------------
-- 6. apply_inventory_adjustments — direct-brand path. Re-declared with the
--    identical signature; the only change is recognizing and tagging a
--    variant's first genuine positive-stock movement, and stamping the
--    product-level launch/visibility state when that happens. Everything
--    else (locking order, guardrails, idempotency-by-operation-key) is
--    byte-identical to the prior canonical version.
-- ----------------------------------------------------------------------------

create or replace function public.apply_inventory_adjustments(
  p_brand_id uuid,
  p_actor_id uuid,
  p_adjustments jsonb,
  p_reason text,
  p_note text,
  p_source text,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_variant record;
  v_type text;
  v_amount integer;
  v_new_quantity integer;
  v_delta integer;
  v_results jsonb := '[]'::jsonb;
  v_fulfillment_mode text;
  v_has_open_transition boolean;
  v_is_opening_stock boolean;
begin
  if jsonb_typeof(p_adjustments) <> 'array'
     or jsonb_array_length(p_adjustments) = 0 then
    raise exception 'At least one inventory adjustment is required';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'An adjustment reason is required';
  end if;
  if nullif(trim(p_operation_key), '') is null then
    raise exception 'An operation key is required';
  end if;

  select fulfillment_mode into v_fulfillment_mode from public.brands where id = p_brand_id for update;
  if v_fulfillment_mode is null then raise exception 'Brand not found'; end if;
  if v_fulfillment_mode = 'zakhnook_fulfilled' then
    raise exception 'PARTNER_DIRECT_ADJUSTMENT_FORBIDDEN: Zakhnook-held stock can only change via a warehouse receipt or an auditable warehouse correction';
  end if;

  select exists (
    select 1 from public.brand_fulfillment_transitions
    where brand_id = p_brand_id and status not in ('completed', 'cancelled', 'failed')
  ) into v_has_open_transition;
  if v_has_open_transition then
    raise exception 'FULFILLMENT_TRANSITION_IN_PROGRESS: inventory adjustments are paused during a fulfillment mode change';
  end if;

  for v_item in select * from jsonb_array_elements(p_adjustments)
  loop
    select pv.id, pv.product_id, pv.quantity, p.brand_id
      into v_variant
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = (v_item->>'variant_id')::uuid
      and p.brand_id = p_brand_id
    for update of pv;

    if v_variant.id is null then
      raise exception 'Variant not found for this brand';
    end if;

    if exists (
      select 1 from public.inventory_movements
      where variant_id = v_variant.id
        and source_operation_key = p_operation_key
    ) then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'variant_id', v_variant.id,
        'new_quantity', v_variant.quantity,
        'replayed', true
      ));
      continue;
    end if;

    v_type := v_item->>'type';
    v_amount := (v_item->>'amount')::integer;
    if v_amount is null or v_amount < 0 then
      raise exception 'Adjustment amount must be a non-negative integer';
    end if;

    if v_type = 'add' then
      v_new_quantity := v_variant.quantity + v_amount;
    elsif v_type = 'remove' then
      v_new_quantity := v_variant.quantity - v_amount;
    elsif v_type = 'set' then
      v_new_quantity := v_amount;
    else
      raise exception 'Invalid adjustment type';
    end if;
    if v_new_quantity < 0 then
      raise exception 'Inventory cannot become negative';
    end if;
    v_delta := v_new_quantity - v_variant.quantity;

    -- Concurrency-safe under the variant's own `for update of pv` lock
    -- taken above: two simultaneous first-stock adjustments for the same
    -- variant can never both see is_opening_stock's own NOT EXISTS check
    -- as true, since the second transaction blocks on the row lock until
    -- the first commits its movement row.
    v_is_opening_stock := v_variant.quantity = 0 and v_new_quantity > 0 and not exists (
      select 1 from public.inventory_movements
      where variant_id = v_variant.id and is_opening_stock = true
    );

    update public.product_variants
    set quantity = v_new_quantity, updated_at = now()
    where id = v_variant.id;

    insert into public.inventory_movements (
      variant_id, product_id, brand_id, previous_quantity, quantity_delta,
      new_quantity, movement_type, reason, note, created_by, source,
      source_operation_key, from_location, to_location, related_entity_type, related_entity_id,
      is_opening_stock
    ) values (
      v_variant.id, v_variant.product_id, p_brand_id, v_variant.quantity,
      v_delta, v_new_quantity,
      case when p_source = 'admin' then 'admin_correction' else 'manual_adjustment' end,
      p_reason, nullif(trim(p_note), ''), p_actor_id, p_source,
      p_operation_key,
      case when v_delta < 0 then 'brand_location' else null end,
      case when v_delta > 0 then 'brand_location' else 'sold_or_removed' end,
      'adjustment', v_variant.id,
      v_is_opening_stock
    );

    if v_is_opening_stock then
      update public.products
      set first_stocked_at = coalesce(first_stocked_at, now())
      where id = v_variant.product_id;
      perform private.stamp_product_first_visible_if_eligible(v_variant.product_id);
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'variant_id', v_variant.id,
      'previous_quantity', v_variant.quantity,
      'quantity_delta', v_delta,
      'new_quantity', v_new_quantity,
      'replayed', false,
      'isOpeningStock', v_is_opening_stock
    ));
  end loop;
  return v_results;
end;
$$;

revoke all on function public.apply_inventory_adjustments(
  uuid,uuid,jsonb,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.apply_inventory_adjustments(
  uuid,uuid,jsonb,text,text,text,text
) to service_role;

-- ----------------------------------------------------------------------------
-- 7. receive_warehouse_document_canonical — partner path. Re-declared with
--    the identical signature and body from the current canonical version
--    (20260814010500_partner_replenishment_request.sql), with exactly two
--    additions: is_opening_stock tagging on a 'to_local' receipt's
--    quantity-increasing movement row, and RESTORING the first_stocked_at
--    stamp that migration's own re-declaration had silently dropped (see
--    this file's header comment — private.mark_product_first_stocked is
--    superseded by the inline stamp below and stays orphaned/unused).
-- ----------------------------------------------------------------------------

create or replace function private.receive_warehouse_document_canonical(
  p_transfer_id uuid,
  p_actor_id uuid,
  p_items jsonb,
  p_note text,
  p_expected_direction text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer record;
  v_input_count integer;
  v_distinct_count integer;
  v_matched_count integer;
  v_remaining_after integer;
  v_item_row record;
  v_variant record;
  v_lock record;
  v_ok integer;
  v_damaged integer;
  v_missing integer;
  v_new_quantity integer;
  v_new_brand_stock integer;
  v_has_discrepancy boolean := false;
  v_results jsonb := '[]'::jsonb;
  v_final_status text;
  v_is_opening_stock boolean;
begin
  if p_expected_direction not in ('to_local', 'to_brand') then
    raise exception 'INVALID_TRANSFER_DIRECTION';
  end if;

  select id, brand_id, status, direction, stock_reserved_at, has_discrepancy,
         related_fulfillment_transition_id into v_transfer
  from public.warehouse_transfers
  where id = p_transfer_id
  for update;
  if v_transfer.id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_transfer.direction <> p_expected_direction then raise exception 'TRANSFER_DIRECTION_MISMATCH'; end if;
  if v_transfer.status not in ('pending', 'submitted', 'approved', 'in_transit', 'partially_received') then
    raise exception 'TRANSFER_ALREADY_DECIDED';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'TRANSFER_ITEMS_REQUIRED';
  end if;

  select count(*), count(distinct input.value->>'item_id')
  into v_input_count, v_distinct_count
  from jsonb_array_elements(p_items) as input(value);
  if v_distinct_count <> v_input_count then
    raise exception 'DUPLICATE_OR_INVALID_TRANSFER_ITEM';
  end if;

  select count(*) into v_matched_count
  from public.warehouse_transfer_items wti
  join jsonb_array_elements(p_items) as input(value)
    on wti.id = (input.value->>'item_id')::uuid
  where wti.transfer_id = p_transfer_id and wti.received_ok_qty is null;
  if v_matched_count <> v_input_count then
    raise exception 'TRANSFER_ITEM_NOT_FOUND_OR_ALREADY_RECONCILED';
  end if;

  for v_lock in
    select pv.id
    from public.product_variants pv
    join public.warehouse_transfer_items wti on wti.variant_id = pv.id
    join jsonb_array_elements(p_items) as input(value) on wti.id = (input.value->>'item_id')::uuid
    where wti.transfer_id = p_transfer_id
    order by pv.id
    for update of pv
  loop
    null;
  end loop;

  for v_item_row in
    select wti.id, wti.variant_id, wti.requested_qty, submitted.payload
    from public.warehouse_transfer_items wti
    join lateral (
      select input.value as payload
      from jsonb_array_elements(p_items) as input(value)
      where input.value->>'item_id' = wti.id::text
    ) submitted on true
    where wti.transfer_id = p_transfer_id
    order by wti.id
  loop
    v_ok := coalesce((v_item_row.payload->>'received_ok_qty')::integer, 0);
    v_damaged := coalesce((v_item_row.payload->>'damaged_qty')::integer, 0);
    v_missing := coalesce((v_item_row.payload->>'missing_qty')::integer, 0);
    if v_ok < 0 or v_damaged < 0 or v_missing < 0 then
      raise exception 'INVALID_RECONCILIATION_QUANTITY';
    end if;
    if v_ok + v_damaged + v_missing <> v_item_row.requested_qty then
      raise exception 'TRANSFER_ITEM_NOT_RECONCILED';
    end if;
    if v_damaged > 0 or v_missing > 0 then v_has_discrepancy := true; end if;

    select id, quantity, product_id, brand_stock_quantity into v_variant
    from public.product_variants where id = v_item_row.variant_id;

    if p_expected_direction = 'to_local' then
      if v_transfer.related_fulfillment_transition_id is not null then
        if v_variant.brand_stock_quantity < v_item_row.requested_qty then
          raise exception 'INSUFFICIENT_BRAND_STOCK_AT_RECEIPT';
        end if;
        v_new_brand_stock := v_variant.brand_stock_quantity - v_item_row.requested_qty;
      else
        v_new_brand_stock := v_variant.brand_stock_quantity;
      end if;
      v_new_quantity := v_variant.quantity + v_ok;
    else
      if v_transfer.stock_reserved_at is null then
        if v_variant.quantity < v_item_row.requested_qty then
          raise exception 'INSUFFICIENT_SELLABLE_STOCK_AT_RETURN';
        end if;
        v_new_quantity := v_variant.quantity - v_item_row.requested_qty;
      else
        v_new_quantity := v_variant.quantity;
      end if;
      v_new_brand_stock := v_variant.brand_stock_quantity + v_ok;
    end if;

    -- Same is_opening_stock rule as apply_inventory_adjustments, evaluated
    -- under the same variant row lock taken above (the `for update of pv`
    -- loop) — only a 'to_local' receipt can ever be a variant's opening
    -- stock; a 'to_brand' return decreases sellable quantity, never counts.
    v_is_opening_stock := p_expected_direction = 'to_local'
      and v_variant.quantity = 0 and v_new_quantity > 0
      and not exists (
        select 1 from public.inventory_movements
        where variant_id = v_variant.id and is_opening_stock = true
      );

    update public.product_variants
    set quantity = v_new_quantity,
        brand_stock_quantity = v_new_brand_stock,
        updated_at = now()
    where id = v_variant.id;

    if p_expected_direction = 'to_local' and v_ok > 0 then
      update public.products
      set first_stocked_at = coalesce(first_stocked_at, now())
      where id = v_variant.product_id;
      perform private.stamp_product_first_visible_if_eligible(v_variant.product_id);
    end if;

    if v_new_quantity <> v_variant.quantity then
      insert into public.inventory_movements (
        variant_id, product_id, brand_id, previous_quantity, quantity_delta,
        new_quantity, movement_type, reason, note, created_by, source,
        source_operation_key, from_location, to_location,
        related_entity_type, related_entity_id, is_opening_stock
      ) values (
        v_variant.id, v_variant.product_id, v_transfer.brand_id,
        v_variant.quantity, v_new_quantity - v_variant.quantity,
        v_new_quantity, 'warehouse_transfer_received',
        case when p_expected_direction = 'to_brand'
          then 'Stock Return Note received'
          else 'Goods Receipt Note received'
        end,
        nullif(pg_catalog.btrim(v_item_row.payload->>'item_note'), ''),
        p_actor_id, 'warehouse_transfer',
        case when p_expected_direction = 'to_brand'
          then 'warehouse-return:' || p_transfer_id::text || ':' || v_item_row.id::text
          else 'warehouse-transfer:' || p_transfer_id::text || ':' || v_item_row.id::text
        end,
        case when p_expected_direction = 'to_local' then 'in_transit_to_zakhnook' else 'zakhnook_available' end,
        case when p_expected_direction = 'to_local' then 'zakhnook_available' else 'returned_to_brand' end,
        'warehouse_document', p_transfer_id, v_is_opening_stock
      );
    end if;

    if v_damaged > 0 or v_missing > 0 then
      insert into public.inventory_movements (
        variant_id, product_id, brand_id, previous_quantity, quantity_delta,
        new_quantity, movement_type, reason, note, created_by, source,
        source_operation_key, from_location, to_location,
        related_entity_type, related_entity_id
      ) values (
        v_variant.id, v_variant.product_id, v_transfer.brand_id, 0, 0, 0,
        'warehouse_quarantine_hold', 'Damaged/missing units held in quarantine',
        nullif(pg_catalog.btrim(v_item_row.payload->>'item_note'), ''), p_actor_id,
        'warehouse_transfer',
        'warehouse-quarantine:' || p_transfer_id::text || ':' || v_item_row.id::text,
        case when p_expected_direction = 'to_local' then 'in_transit_to_zakhnook' else 'zakhnook_available' end,
        'zakhnook_quarantine', 'warehouse_document', p_transfer_id
      );
    end if;

    update public.warehouse_transfer_items
    set received_ok_qty = v_ok,
        damaged_qty = v_damaged,
        missing_qty = v_missing,
        item_note = coalesce(
          nullif(pg_catalog.btrim(v_item_row.payload->>'item_note'), ''),
          item_note
        )
    where id = v_item_row.id;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'variant_id', v_variant.id,
      'received_ok_qty', v_ok,
      'damaged_qty', v_damaged,
      'missing_qty', v_missing,
      'new_quantity', v_new_quantity,
      'isOpeningStock', v_is_opening_stock
    ));
  end loop;

  select count(*) into v_remaining_after
  from public.warehouse_transfer_items
  where transfer_id = p_transfer_id and received_ok_qty is null;

  v_final_status := case when v_remaining_after = 0 then 'received' else 'partially_received' end;

  update public.warehouse_transfers
  set status = v_final_status,
      decided_by = case when v_final_status = 'received' then p_actor_id else decided_by end,
      decided_at = case when v_final_status = 'received' then now() else decided_at end,
      receiving_note = coalesce(nullif(pg_catalog.btrim(p_note), ''), receiving_note),
      has_discrepancy = has_discrepancy or v_has_discrepancy,
      updated_at = now()
  where id = p_transfer_id;

  return jsonb_build_object('items', v_results, 'status', v_final_status, 'remaining_unreconciled', v_remaining_after);
end;
$$;

revoke all on function private.receive_warehouse_document_canonical(uuid, uuid, jsonb, text, text)
  from public, anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. Explicit "Show now" override — a brand owner/admin overriding a
--    when_stocked product to show_now before stock arrives. Authorized
--    server-side operation only; the caller (API route) is responsible for
--    the audit_logs entry, matching this repo's established pattern of
--    RPCs returning a jsonb envelope with enough of a `before` snapshot for
--    the caller to build one.
-- ----------------------------------------------------------------------------

create or replace function public.set_product_launch_policy_show_now(
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
begin
  select * into v_product from public.products where id = p_product_id for update;
  if v_product.id is null then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'This product no longer exists.');
  end if;
  -- p_brand_id non-null means "verify this product belongs to this brand"
  -- (brand-portal callers); null means the caller has already been
  -- authorized as admin at the application layer — same convention already
  -- used across this codebase's other lifecycle RPCs.
  if p_brand_id is not null and v_product.brand_id <> p_brand_id then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_OWNED', 'message', 'You do not have access to this product.');
  end if;

  if v_product.launch_policy = 'show_now' then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_SHOW_NOW', 'message', 'This product is already set to show now.', 'launchPolicy', 'show_now');
  end if;

  update public.products set launch_policy = 'show_now' where id = p_product_id;
  perform private.stamp_product_first_visible_if_eligible(p_product_id);

  return jsonb_build_object(
    'ok', true, 'code', 'LAUNCH_POLICY_UPDATED',
    'message', 'This product will now show to customers even while out of stock.',
    'launchPolicy', 'show_now', 'before', to_jsonb(v_product)
  );
end;
$$;

revoke all on function public.set_product_launch_policy_show_now(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_product_launch_policy_show_now(text, uuid, uuid, text) to service_role;
