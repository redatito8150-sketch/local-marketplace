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

-- Durable recognition is stored on the variant as well as the one real
-- movement marker. This is necessary for legacy rows whose current positive
-- quantity predates the inventory ledger: absence of a movement is not proof
-- that opening stock never happened.
alter table public.product_variants
  add column if not exists opening_stock_recognized_at timestamptz;
alter table public.product_variants
  add column if not exists opening_stock_recognition_source text;
alter table public.product_variants drop constraint if exists product_variants_opening_stock_recognition_source_check;
alter table public.product_variants add constraint product_variants_opening_stock_recognition_source_check
  check (opening_stock_recognition_source is null or opening_stock_recognition_source in (
    'historical_movement', 'legacy_positive_quantity', 'inventory_adjustment', 'warehouse_receipt'
  ));

grant select (launch_policy, first_visible_at) on public.products to anon, authenticated;

comment on column public.products.launch_policy is
  'Database-authoritative publish-time choice: show_now (visible to customers even at 0 stock, with Notify Me) or when_stocked (internally published, hidden from every customer-facing surface until first_stocked_at is set). Never overloads paused_by_brand/status/fulfillment_mode — see private.is_product_customer_visible().';
comment on column public.products.first_visible_at is
  'Immutable — set once, the first moment this product actually became visible to a real customer (after any publish_date, and after the stock gate for when_stocked). Never cleared or rewritten by Pause/Resume. Existing-data backfilled below; going forward only private.stamp_product_first_visible_if_eligible() may set it.';
comment on column public.inventory_movements.is_opening_stock is
  'True on exactly one row per variant: the first genuine positive-stock movement it ever received (a direct apply_inventory_adjustments add, or a partner receive_warehouse_document_canonical receipt). The movement''s own movement_type/source is preserved unchanged — this is an additive marker, not a re-classification. Never set by product creation, which no longer creates any movement row at all.';
comment on column public.product_variants.opening_stock_recognized_at is
  'Durable once-only recognition that this variant has already had opening stock. For legacy positive quantities with no ledger row, this prevents a later restock from being mislabeled as opening stock without fabricating an inventory movement.';
comment on column public.product_variants.opening_stock_recognition_source is
  'Auditable source for opening_stock_recognized_at: historical_movement, legacy_positive_quantity, inventory_adjustment, or warehouse_receipt.';

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
-- real once it actually launches).
--
-- CORRECTIVE PASS: the candidate date is now the LATER of (a) publish
-- eligibility time (publish_date, falling back to created_at) and (b) —
-- for when_stocked products specifically — first_stocked_at. A when_stocked
-- product could never have been visible before its stock gate passed, so
-- using publish_date alone (as the original backfill did) could produce an
-- impossibly early first_visible_at, predating the actual moment it
-- became visible whenever first_stocked_at came after publish_date. For a
-- show_now product first_stocked_at is irrelevant (it was visible from
-- publish regardless of stock), so the greatest() collapses to the same
-- publish-eligibility date as before. Still capped at now() either way —
-- never a fabricated future date. New Arrivals' 20-day window is a moving
-- window, not a one-time classification, so it self-corrects for anything
-- this slightly under/over-estimates.
update public.products p
set first_visible_at = least(
  now(),
  case
    when p.launch_policy = 'when_stocked'
      then greatest(coalesce(p.publish_date, p.created_at), p.first_stocked_at)
    else coalesce(p.publish_date, p.created_at)
  end
)
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
-- 2b. CORRECTIVE PASS — historical opening-stock backfill.
--
-- Deterministic rule: a variant's real, historical opening-stock event is
-- the EARLIEST inventory_movements row that took it from previous_quantity
-- = 0 to new_quantity > 0 — chronologically first (created_at, then id to
-- break ties), regardless of whether it predates this migration or the
-- is_opening_stock column itself. This covers legacy data created by the
-- old (pre-launch-policy) workflow, including rows written by the original
-- opening_stock_inventory_workflow migration, without needing to know
-- anything about which code path wrote them.
--
-- A variant with no positive movement but a positive CURRENT quantity is
-- separately recognized on product_variants below. We do not fabricate a
-- movement row or quantities for it: the durable recognition timestamp and
-- explicit legacy_positive_quantity source record exactly what is known.
--
-- This directly fixes the gap the corrective-pass review found: a legacy
-- variant that previously reached positive stock, later sold back down to
-- 0, and carries no is_opening_stock marker would otherwise have its NEXT
-- restock wrongly recognized as "opening stock" by the runtime check alone
-- (which only ever looked for an existing is_opening_stock=true row). Once
-- backfilled, the existing historical row is what's marked — not a later,
-- unrelated restock.
--
-- inventory_movements is protected by an unconditional BEFORE UPDATE OR
-- DELETE immutability trigger. Take an ACCESS EXCLUSIVE table lock while the
-- trigger is disabled so no concurrent session can mutate ledger history in
-- the maintenance window. Both ALTERs and the backfill run in the migration's
-- transaction, so any error rolls the trigger state and data change back
-- together.
lock table public.inventory_movements in access exclusive mode;
alter table public.inventory_movements
  disable trigger inventory_movements_immutable;

with earliest_positive as (
  select distinct on (variant_id) id
  from public.inventory_movements
  where previous_quantity = 0 and new_quantity > 0
  order by variant_id, created_at asc, id asc
)
update public.inventory_movements im
set is_opening_stock = true
from earliest_positive ep
where im.id = ep.id
  and not exists (
    select 1 from public.inventory_movements existing
    where existing.variant_id = im.variant_id and existing.is_opening_stock = true
  );

alter table public.inventory_movements
  enable trigger inventory_movements_immutable;

with earliest_positive as (
  select distinct on (variant_id) variant_id, created_at
  from public.inventory_movements
  where new_quantity > 0
  order by variant_id, created_at asc, id asc
)
update public.product_variants pv
set opening_stock_recognized_at = coalesce(
      ep.created_at,
      least(now(), coalesce(pv.updated_at, pv.created_at, now()))
    ),
    opening_stock_recognition_source = case
      when ep.variant_id is not null then 'historical_movement'
      else 'legacy_positive_quantity'
    end
from (select id from public.product_variants) candidate
left join earliest_positive ep on ep.variant_id = candidate.id
where pv.id = candidate.id
  and pv.opening_stock_recognized_at is null
  and (ep.variant_id is not null or pv.quantity > 0);

-- Enforces the invariant the runtime code already assumes: at most one
-- is_opening_stock = true row can ever exist per variant. A unique index
-- (not just a lookup index) — the backfill above is safe against this by
-- construction (DISTINCT ON already yields one row per variant_id), and
-- any future direct/manual write that tried to mark a second row would now
-- fail loudly at the database level instead of silently corrupting the
-- "exactly once" guarantee.
create unique index if not exists inventory_movements_one_opening_stock_per_variant_idx
  on public.inventory_movements (variant_id)
  where is_opening_stock;

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
  -- A paid Paymob attempt was already accepted through the canonical
  -- visibility gate at create_payment_attempt. Once its authenticated paid
  -- webhook is being reflected, a later Pause/Archive hides the product from
  -- NEW customers but must not strand this already-paid customer. The local
  -- transaction flag is set only inside the service-role-only paid RPC.
  if coalesce(current_setting('app.paid_attempt_fulfillment_in_progress', true), '') <> 'on'
     and not coalesce(private.is_product_customer_visible(v_product_id), false) then
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

-- ----------------------------------------------------------------------------
-- 4b. CORRECTIVE PASS — atomic, database-boundary first_visible_at
--     stamping. The original design relied on every API route that could
--     newly make a product visible remembering to call the
--     stamp_product_first_visible_if_eligible RPC as a SEPARATE call after
--     its own write committed — a best-effort TypeScript call that could
--     fail (network error, process crash, a future call site someone
--     forgets to add) after the product row itself was already,
--     genuinely, visible. This AFTER trigger makes stamping unconditional
--     and atomic with the SAME transaction as ANY products table write —
--     first publish, resume, the explicit Show Now override, a publish_date
--     edit, or literally any other UPDATE/INSERT — by re-evaluating the
--     full canonical predicate against the just-written row every time.
--     The application-layer RPC calls elsewhere in this codebase remain in
--     place as harmless, fully redundant defense in depth, but this
--     trigger is what actually GUARANTEES the invariant now.
--
--     Bounded self-recursion note: the inner UPDATE inside
--     stamp_product_first_visible_if_eligible fires this same AFTER
--     trigger again for the same row. On that recursive firing,
--     first_visible_at is already non-null (just set), so the guard inside
--     the function is false and it becomes a single, cheap no-op update
--     (0 rows matched) — the recursion terminates after exactly one extra,
--     harmless invocation.
-- ----------------------------------------------------------------------------

create or replace function private.products_after_write_stamp_visibility()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.stamp_product_first_visible_if_eligible(new.id);
  return null;
end;
$$;

drop trigger if exists products_stamp_first_visible_at on public.products;
create trigger products_stamp_first_visible_at
after insert or update on public.products
for each row execute function private.products_after_write_stamp_visibility();

revoke all on function private.products_after_write_stamp_visibility() from public, anon, authenticated;

-- Immutability at the database boundary: once first_visible_at is
-- non-null, no ordinary UPDATE may clear or rewrite it — silently pins it
-- back to the existing value rather than raising, so an unrelated update
-- that doesn't know or care about this column (the overwhelming majority
-- of product writes) is never broken by carrying a stale/absent value for
-- it. This is a BEFORE trigger so the pinned value is what actually gets
-- persisted, not a post-hoc correction.
create or replace function private.enforce_first_visible_at_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.first_visible_at is not null
     and new.first_visible_at is distinct from old.first_visible_at then
    new.first_visible_at := old.first_visible_at;
  end if;
  return new;
end;
$$;

drop trigger if exists products_enforce_first_visible_at_immutable on public.products;
create trigger products_enforce_first_visible_at_immutable
before update on public.products
for each row execute function private.enforce_first_visible_at_immutable();

revoke all on function private.enforce_first_visible_at_immutable() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4c. CORRECTIVE PASS — explicit product lifecycle/authorization guards.
--
-- Two bypasses closed at the database boundary (the real enforcement
-- point — API-layer checks are UX, not security):
--
--   1. A published product can never revert to draft via an ordinary
--      UPDATE. The only way "Save as Draft" could previously demote an
--      already-published product was a client-side UI oversight (the
--      create wizard kept offering it after a successful publish); this
--      makes it impossible regardless of what any client sends.
--
--   2. products.launch_policy, once a product is published, may only ever
--      move when_stocked -> show_now, and ONLY through the canonical
--      set_product_launch_policy_show_now RPC (which sets the session-local
--      app.product_show_now_override_in_progress flag immediately before
--      its own UPDATE — the same established pattern as
--      app.product_restore_in_progress / app.admin_archive_non_pristine_draft
--      elsewhere in this codebase). This closes two real bypasses found in
--      review: the generic product-edit PATCH path could otherwise freely
--      resubmit any launch_policy value on every save (reachable by a
--      brand ASSISTANT, who is not supposed to be able to change launch
--      policy at all — that action is owner/admin-only), and show_now ->
--      when_stocked was reachable the same way, which would let launch
--      policy become a silent, undocumented substitute for Pause. The
--      first-publish transition itself (draft -> published, launch_policy
--      chosen at that moment) is deliberately unaffected — old.status <>
--      'published' there, so the guard does not apply.
-- ----------------------------------------------------------------------------

create or replace function private.enforce_product_lifecycle_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_show_now_override_in_progress boolean :=
    coalesce(current_setting('app.product_show_now_override_in_progress', true), '') = 'on';
begin
  if tg_op = 'UPDATE' and old.status = 'published' and new.status = 'draft' then
    raise exception 'PRODUCT_PUBLISHED_CANNOT_REVERT_TO_DRAFT';
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'published'
     and new.launch_policy is distinct from old.launch_policy then
    if old.launch_policy = 'when_stocked' and new.launch_policy = 'show_now' then
      if not v_show_now_override_in_progress then
        raise exception 'LAUNCH_POLICY_CHANGE_REQUIRES_SHOW_NOW_RPC';
      end if;
    else
      raise exception 'LAUNCH_POLICY_TRANSITION_NOT_ALLOWED';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists products_enforce_lifecycle_transition on public.products;
create trigger products_enforce_lifecycle_transition
before update on public.products
for each row execute function private.enforce_product_lifecycle_transition();

revoke all on function private.enforce_product_lifecycle_transition() from public, anon, authenticated;

-- Safety-net cron target for the one case with no natural write to hook: a
-- when_stocked product that already has stock, or a show_now product, whose
-- only remaining blocker was a future publish_date simply elapsing. Every
-- other transition (first stock arriving, publish, resume, explicit "Show
-- now") now stamps atomically at the database boundary via the
-- products_stamp_first_visible_at AFTER trigger below (see part 4) — this
-- function exists purely to catch scheduled-date elapse with no other
-- accompanying write, and as a general backstop.
--
-- CORRECTIVE PASS — starvation fix: the full canonical eligibility
-- predicate is now evaluated INSIDE the WHERE clause, before LIMIT, rather
-- than fetched-then-filtered inside the loop. The previous version claimed
-- a bounded batch using only the coarse status/paused/publish_date
-- conditions, then rejected ineligible rows (e.g. a when_stocked product
-- still waiting on stock, or one blocked by an open fulfillment
-- transition) inside the loop without ever excluding them from the next
-- run's candidate set — the same batch of permanently- or
-- temporarily-ineligible rows would be reselected by `order by
-- publish_date, created_at` on every single invocation, forever starving
-- any genuinely eligible row that happened to sort after them. Now only
-- rows that already pass the full predicate are ever claimed by LIMIT, so
-- every row this function locks is activated — no post-fetch rejection,
-- no starvation. Postgres's own `for update` re-check semantics (a
-- concurrently-modified row is re-evaluated against the WHERE clause, not
-- just re-locked) keep this safe against a row changing eligibility
-- between the snapshot and the lock.
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
      -- Narrows the candidate set with the same coarse, indexable
      -- conditions above first (cheap), then the full predicate (more
      -- expensive per row, but only ever evaluated for rows that already
      -- passed the coarse filter).
      and private.is_product_customer_visible(id)
    order by publish_date nulls first, created_at
    limit greatest(1, least(coalesce(p_batch_size, 100), 500))
    for update skip locked
  loop
    v_checked := v_checked + 1;
    update public.products set first_visible_at = now() where id = v_row.id and first_visible_at is null;
    v_activated := v_activated + 1;
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
    select pv.id, pv.product_id, pv.quantity, pv.opening_stock_recognized_at, p.brand_id
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
    -- variant can never both see this NOT EXISTS check as true, since the
    -- second transaction blocks on the row lock until the first commits
    -- its movement row.
    --
    v_is_opening_stock := v_variant.quantity = 0
      and v_new_quantity > 0
      and v_variant.opening_stock_recognized_at is null;

    update public.product_variants
    set quantity = v_new_quantity,
        opening_stock_recognized_at = case
          when v_is_opening_stock then coalesce(opening_stock_recognized_at, now())
          else opening_stock_recognized_at
        end,
        opening_stock_recognition_source = case
          when v_is_opening_stock then coalesce(opening_stock_recognition_source, 'inventory_adjustment')
          else opening_stock_recognition_source
        end,
        updated_at = now()
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

    select id, quantity, product_id, brand_stock_quantity, opening_stock_recognized_at into v_variant
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

    -- Same durable recognition rule as apply_inventory_adjustments, under the
    -- same variant row lock taken above (the `for update of pv` loop) —
    -- only a 'to_local' receipt can ever be a variant's opening stock; a
    -- 'to_brand' return decreases sellable quantity, never counts.
    v_is_opening_stock := p_expected_direction = 'to_local'
      and v_variant.quantity = 0 and v_new_quantity > 0
      and v_variant.opening_stock_recognized_at is null;

    update public.product_variants
    set quantity = v_new_quantity,
        brand_stock_quantity = v_new_brand_stock,
        opening_stock_recognized_at = case
          when v_is_opening_stock then coalesce(opening_stock_recognized_at, now())
          else opening_stock_recognized_at
        end,
        opening_stock_recognition_source = case
          when v_is_opening_stock then coalesce(opening_stock_recognition_source, 'warehouse_receipt')
          else opening_stock_recognition_source
        end,
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

  -- Authorizes the one allowed post-publish launch_policy transition
  -- (when_stocked -> show_now) against
  -- private.enforce_product_lifecycle_transition()'s guard — local to this
  -- transaction, auto-clears at commit/rollback, so no other statement in
  -- any other session/transaction can ever see or rely on it.
  perform set_config('app.product_show_now_override_in_progress', 'on', true);
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

-- ============================================================================
-- CORRECTIVE PASS — sections 4/5/6/7: durable back-in-stock delivery,
-- canonical visibility on subscribe/wishlist, and checkout/payment
-- concurrency hardening.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 9. Durable back-in-stock delivery — replaces "delete the subscription
--    then try to send" (no recovery path if the send fails after the row
--    is already gone) with an explicit claim/lease state machine on the
--    subscription row itself. A concurrent worker can never double-claim
--    (the claiming UPDATE's own WHERE clause + row-level locking make two
--    simultaneous claims serialize, and the second only ever sees 0 rows
--    to claim once the first commits), and a transient failure or a
--    process crash mid-delivery never silently discards the subscription:
--    it either goes back to 'pending' for the next run (attempts budget
--    not yet exhausted) or lands in a permanent, inspectable 'failed'
--    state -- never deleted.
-- ----------------------------------------------------------------------------

alter table public.back_in_stock_subscriptions
  add column if not exists delivery_status text not null default 'pending';
alter table public.back_in_stock_subscriptions drop constraint if exists back_in_stock_subscriptions_delivery_status_check;
alter table public.back_in_stock_subscriptions add constraint back_in_stock_subscriptions_delivery_status_check
  check (delivery_status in ('pending', 'claimed', 'sent', 'failed'));
alter table public.back_in_stock_subscriptions add column if not exists claimed_at timestamptz;
alter table public.back_in_stock_subscriptions add column if not exists claim_token uuid;
alter table public.back_in_stock_subscriptions add column if not exists delivery_attempts integer not null default 0;
alter table public.back_in_stock_subscriptions add column if not exists last_delivery_error text;
alter table public.back_in_stock_subscriptions add column if not exists sent_at timestamptz;
alter table public.back_in_stock_subscriptions add column if not exists email_sent_at timestamptz;
alter table public.back_in_stock_subscriptions add column if not exists notification_sent_at timestamptz;

-- A subscription is one request for one stockout/restock cycle. Historical
-- sent/failed rows remain available for support, but must not block the same
-- shopper from explicitly subscribing again after a later stockout.
alter table public.back_in_stock_subscriptions
  drop constraint if exists back_in_stock_subscriptions_user_id_variant_id_key;

create unique index if not exists back_in_stock_subscriptions_one_active_per_user_variant_idx
  on public.back_in_stock_subscriptions (user_id, variant_id)
  where delivery_status in ('pending', 'claimed');

create index if not exists back_in_stock_subscriptions_pending_idx
  on public.back_in_stock_subscriptions (variant_id)
  where delivery_status in ('pending', 'claimed');

comment on column public.back_in_stock_subscriptions.delivery_status is
  'pending: eligible for claiming. claimed: a worker has a lease on it (see claimed_at/claim_token) -- stale leases (claimed_at older than the lease window) are re-claimable. sent: delivered successfully, terminal. failed: delivery_attempts exhausted the retry budget, terminal but retained (never deleted) for support/inspection.';

-- Atomically claims eligible, currently-visible subscriptions for a batch
-- of variants -- visibility (private.is_product_customer_visible, joined
-- via the subscription's own product_id) is checked as PART OF the same
-- claiming UPDATE, not a separate read beforehand that could go stale.
-- p_lease_minutes reclaims a 'claimed' row whose worker never finished
-- (crashed, timed out) instead of leaving it stuck forever.
create or replace function private.claim_back_in_stock_deliveries(
  p_variant_ids uuid[] default null,
  p_lease_minutes integer default 5,
  p_max_attempts integer default 5,
  p_batch_size integer default 100
)
returns table (
  id uuid,
  user_id uuid,
  email text,
  product_id text,
  variant_id uuid,
  delivery_attempts integer,
  claim_token uuid,
  email_sent_at timestamptz,
  notification_sent_at timestamptz
)
language plpgsql
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select s.id
    from public.back_in_stock_subscriptions s
    join public.product_variants pv
      on pv.id = s.variant_id and pv.product_id = s.product_id
    where (p_variant_ids is null or s.variant_id = any(p_variant_ids))
      and s.delivery_attempts < greatest(1, coalesce(p_max_attempts, 5))
      and (
        s.delivery_status = 'pending'
        or (
          s.delivery_status = 'claimed'
          and s.claimed_at < now() - make_interval(mins => greatest(1, coalesce(p_lease_minutes, 5)))
        )
      )
      and pv.quantity > 0
      and pv.selling_status = 'active'
      and coalesce(pv.is_archived, false) = false
      and private.is_product_customer_visible(s.product_id)
    order by s.created_at, s.id
    for update of s skip locked
    limit greatest(1, least(coalesce(p_batch_size, 100), 500))
  )
  update public.back_in_stock_subscriptions s
  set delivery_status = 'claimed',
      claimed_at = now(),
      claim_token = gen_random_uuid(),
      delivery_attempts = s.delivery_attempts + 1
  from candidates c
  where s.id = c.id
  returning s.id, s.user_id, s.email, s.product_id, s.variant_id,
    s.delivery_attempts, s.claim_token, s.email_sent_at, s.notification_sent_at;
end;
$$;

revoke all on function private.claim_back_in_stock_deliveries(uuid[], integer, integer, integer) from public, anon, authenticated, service_role;

create or replace function public.claim_back_in_stock_deliveries(
  p_variant_ids uuid[] default null,
  p_lease_minutes integer default 5,
  p_max_attempts integer default 5,
  p_batch_size integer default 100
)
returns table (
  id uuid,
  user_id uuid,
  email text,
  product_id text,
  variant_id uuid,
  delivery_attempts integer,
  claim_token uuid,
  email_sent_at timestamptz,
  notification_sent_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select * from private.claim_back_in_stock_deliveries(
    p_variant_ids, p_lease_minutes, p_max_attempts, p_batch_size
  );
$$;

revoke all on function public.claim_back_in_stock_deliveries(uuid[], integer, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_back_in_stock_deliveries(uuid[], integer, integer, integer) to service_role;

-- Channel acknowledgements are fenced by the exact claim token. A worker
-- whose lease expired cannot acknowledge a newer worker's claim. The row is
-- terminal only after both independently-idempotent channels have succeeded.
create or replace function public.mark_back_in_stock_delivery_channel_sent(
  p_id uuid,
  p_claim_token uuid,
  p_channel text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_channel not in ('email', 'notification') then
    raise exception 'INVALID_BACK_IN_STOCK_DELIVERY_CHANNEL';
  end if;

  update public.back_in_stock_subscriptions
  set email_sent_at = case when p_channel = 'email' then coalesce(email_sent_at, now()) else email_sent_at end,
      notification_sent_at = case when p_channel = 'notification' then coalesce(notification_sent_at, now()) else notification_sent_at end,
      delivery_status = case
        when (p_channel = 'email' or email_sent_at is not null)
          and (p_channel = 'notification' or notification_sent_at is not null)
          then 'sent'
        else 'claimed'
      end,
      sent_at = case
        when (p_channel = 'email' or email_sent_at is not null)
          and (p_channel = 'notification' or notification_sent_at is not null)
          then coalesce(sent_at, now())
        else sent_at
      end,
      claim_token = case
        when (p_channel = 'email' or email_sent_at is not null)
          and (p_channel = 'notification' or notification_sent_at is not null)
          then null
        else claim_token
      end
  where id = p_id
    and claim_token = p_claim_token
    and delivery_status = 'claimed';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.mark_back_in_stock_delivery_channel_sent(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.mark_back_in_stock_delivery_channel_sent(uuid, uuid, text) to service_role;

-- Reverts to 'pending' (retryable on a later run) while under the attempts
-- budget; becomes a permanent, inspectable 'failed' once exhausted -- never
-- deleted either way, so a transient failure or a crash mid-delivery can
-- never silently lose the subscription.
create or replace function public.mark_back_in_stock_delivery_failed(
  p_id uuid,
  p_claim_token uuid,
  p_error text,
  p_max_attempts integer default 5
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
  v_updated integer;
begin
  select delivery_attempts into v_attempts
  from public.back_in_stock_subscriptions
  where id = p_id and claim_token = p_claim_token and delivery_status = 'claimed'
  for update;
  if v_attempts is null then
    return false;
  end if;
  update public.back_in_stock_subscriptions
  set delivery_status = case when v_attempts >= greatest(1, coalesce(p_max_attempts, 5)) then 'failed' else 'pending' end,
      last_delivery_error = left(coalesce(p_error, ''), 2000),
      claim_token = null
  where id = p_id and claim_token = p_claim_token and delivery_status = 'claimed';
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.mark_back_in_stock_delivery_failed(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.mark_back_in_stock_delivery_failed(uuid, uuid, text, integer) to service_role;

-- The in-account channel uses a stable delivery key so a process crash after
-- INSERT but before acknowledgement cannot create a duplicate notification.
alter table public.user_notifications add column if not exists delivery_key text;
create unique index if not exists user_notifications_delivery_key_idx
  on public.user_notifications (delivery_key)
  where delivery_key is not null;

-- Reject a subscription attempt outright for a product that is not
-- CURRENTLY customer-visible -- a show_now out-of-stock product is
-- eligible (that's the whole point of Notify Me); a hidden when_stocked,
-- paused, future-scheduled, inactive-brand, archived, or
-- transition-blocked product is not, since there would be nothing
-- legitimate to "notify" the customer back to.
create or replace function private.enforce_back_in_stock_subscription_visibility()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and not coalesce(private.is_product_customer_visible(new.product_id), false) then
    raise exception 'PRODUCT_NOT_AVAILABLE_FOR_NOTIFY_ME';
  end if;
  if tg_op = 'INSERT' and not exists (
    select 1
    from public.product_variants pv
    where pv.id = new.variant_id
      and pv.product_id = new.product_id
      and (
        pv.quantity <= 0
        or pv.selling_status <> 'active'
        or coalesce(pv.is_archived, false) = true
      )
  ) then
    raise exception 'VARIANT_NOT_ELIGIBLE_FOR_NOTIFY_ME';
  end if;
  return new;
end;
$$;

drop trigger if exists back_in_stock_subscriptions_enforce_visibility on public.back_in_stock_subscriptions;
create trigger back_in_stock_subscriptions_enforce_visibility
before insert on public.back_in_stock_subscriptions
for each row execute function private.enforce_back_in_stock_subscription_visibility();

revoke all on function private.enforce_back_in_stock_subscription_visibility() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 10. enforce_order_item_product_available hardened: derive the product
--     strictly from variant_id when present (never trust a caller-supplied
--     product_id that doesn't actually match the variant it's paired
--     with -- a mismatched pair could otherwise let a visible product's id
--     authorize a variant that actually belongs to a hidden one).
-- ----------------------------------------------------------------------------

create or replace function private.enforce_order_item_product_available()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_product_id text;
  v_variant_product_id text;
begin
  if new.variant_id is not null then
    select product_id into v_variant_product_id from public.product_variants where id = new.variant_id;
    if v_variant_product_id is null then
      raise exception 'PRODUCT_NOT_AVAILABLE_FOR_ORDER';
    end if;
    -- The variant's OWN product always wins -- a caller-supplied
    -- product_id that disagrees with the variant it's paired with is
    -- exactly the mismatch this check exists to catch, not something to
    -- silently trust.
    if new.product_id is not null and new.product_id <> v_variant_product_id then
      raise exception 'PRODUCT_VARIANT_MISMATCH';
    end if;
    v_product_id := v_variant_product_id;
  else
    v_product_id := new.product_id;
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

revoke all on function private.enforce_order_item_product_available() from public, anon, authenticated;

drop trigger if exists order_items_enforce_product_available on public.order_items;
create trigger order_items_enforce_product_available
before insert on public.order_items
for each row execute function private.enforce_order_item_product_available();

-- ----------------------------------------------------------------------------
-- 11. Payment intention creation hardened: locks every implicated
--     brand/product/variant and rechecks the canonical visibility
--     predicate INSIDE the same transaction, immediately before control
--     returns to the caller (which then makes the external Paymob API
--     call outside this transaction) -- closing the gap where
--     lib/payments/intentionCart.ts's own visibility check (run before
--     this RPC, in a separate round trip) could go stale if a product's
--     visibility changed in between. Lock order: brands first (by id,
--     ascending -- a deterministic order avoids deadlocking against
--     apply_inventory_adjustments/a fulfillment transition/another
--     concurrent intention, which already lock brands first themselves),
--     then products, then variants.
-- ----------------------------------------------------------------------------

create or replace function private.lock_and_verify_intention_cart_visibility(
  p_cart_snapshot jsonb,
  p_require_current_visibility boolean default true,
  p_require_current_inventory boolean default true
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_brand_id uuid;
  v_product_id text;
  v_variant_id uuid;
  v_variant_product_id text;
  v_variant_quantity integer;
  v_variant_selling_status text;
  v_variant_is_archived boolean;
  v_requested_quantity integer;
begin
  for v_brand_id in
    select distinct b.id
    from jsonb_array_elements(p_cart_snapshot) as item
    join public.products p on p.id = (item->>'productId')
    join public.brands b on b.id = p.brand_id
    order by b.id
  loop
    perform 1 from public.brands where id = v_brand_id for update;
  end loop;

  for v_product_id in
    select distinct item->>'productId'
    from jsonb_array_elements(p_cart_snapshot) as item
    order by 1
  loop
    perform 1 from public.products where id = v_product_id for update;
    if p_require_current_visibility
       and not coalesce(private.is_product_customer_visible(v_product_id), false) then
      raise exception 'PRODUCT_NOT_AVAILABLE_FOR_ORDER: %', v_product_id;
    end if;
  end loop;

  for v_variant_id in
    select distinct nullif(item->>'variantId', '')::uuid
    from jsonb_array_elements(p_cart_snapshot) as item
    where nullif(item->>'variantId', '') is not null
    order by 1
  loop
    select product_id, quantity, selling_status, is_archived
      into v_variant_product_id, v_variant_quantity, v_variant_selling_status, v_variant_is_archived
    from public.product_variants
    where id = v_variant_id
    for update;
    if v_variant_product_id is null then
      raise exception 'PRODUCT_VARIANT_MISMATCH';
    end if;
    if not exists (
      select 1 from jsonb_array_elements(p_cart_snapshot) as item
      where nullif(item->>'variantId', '')::uuid = v_variant_id
        and item->>'productId' = v_variant_product_id
    ) then
      raise exception 'PRODUCT_VARIANT_MISMATCH';
    end if;
    select sum((item->>'quantity')::integer)
      into v_requested_quantity
    from jsonb_array_elements(p_cart_snapshot) as item
    where nullif(item->>'variantId', '')::uuid = v_variant_id;
    if p_require_current_inventory and (
      v_variant_selling_status <> 'active'
      or coalesce(v_variant_is_archived, false)
      or v_requested_quantity is null
      or v_requested_quantity <= 0
      or v_variant_quantity < v_requested_quantity
    ) then
      raise exception 'INSUFFICIENT_STOCK: %', v_variant_id;
    end if;
  end loop;
end;
$$;

revoke all on function private.lock_and_verify_intention_cart_visibility(jsonb, boolean, boolean) from public, anon, authenticated, service_role;

-- COD snapshots use snake_case keys. Lock every implicated row before any
-- order/stock work, in the same brand -> product -> variant order used by the
-- card path, so opposite client array orders cannot deadlock each other.
create or replace function private.lock_and_verify_cod_cart_visibility(p_items jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_brand_id uuid;
  v_product_id text;
  v_variant_id uuid;
begin
  for v_brand_id in
    select distinct p.brand_id
    from jsonb_array_elements(p_items) as item
    join public.products p on p.id = item->>'product_id'
    order by p.brand_id
  loop
    perform 1 from public.brands where id = v_brand_id for update;
  end loop;

  for v_product_id in
    select distinct item->>'product_id'
    from jsonb_array_elements(p_items) as item
    order by 1
  loop
    perform 1 from public.products where id = v_product_id for update;
    if not coalesce(private.is_product_customer_visible(v_product_id), false) then
      raise exception 'PRODUCT_NOT_AVAILABLE_FOR_ORDER: %', v_product_id;
    end if;
  end loop;

  for v_variant_id in
    select distinct nullif(item->>'variant_id', '')::uuid
    from jsonb_array_elements(p_items) as item
    where nullif(item->>'variant_id', '') is not null
    order by 1
  loop
    perform 1 from public.product_variants where id = v_variant_id for update;
  end loop;
end;
$$;

revoke all on function private.lock_and_verify_cod_cart_visibility(jsonb) from public, anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 9b. Wishlist: adding a product must require it to be currently
--     customer-visible (the same rule as back_in_stock_subscriptions
--     above) -- removal is NEVER gated (see the trigger's own TG_OP check),
--     since a shopper must always be able to remove a now-hidden product
--     from their wishlist.
-- ----------------------------------------------------------------------------

create or replace function private.enforce_wishlist_visibility()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and not coalesce(private.is_product_customer_visible(new.product_id), false) then
    raise exception 'PRODUCT_NOT_AVAILABLE_FOR_WISHLIST';
  end if;
  return new;
end;
$$;

drop trigger if exists wishlists_enforce_visibility on public.wishlists;
create trigger wishlists_enforce_visibility
before insert on public.wishlists
for each row execute function private.enforce_wishlist_visibility();

revoke all on function private.enforce_wishlist_visibility() from public, anon, authenticated;

-- Re-declares public.create_payment_attempt (20260814000007_payment_transition_coordination.sql,
-- already applied elsewhere -- this repo's established layering
-- convention). Byte-identical to that version except for one addition:
-- private.lock_and_verify_intention_cart_visibility(p_cart_snapshot) runs
-- after the existing brand lock + fulfillment-transition check and before
-- the payment_attempts insert, so every product this cart references is
-- locked and re-checked against the canonical visibility predicate in the
-- SAME transaction that creates the attempt -- not just once, earlier, in
-- lib/payments/intentionCart.ts's own separate read.
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

  return pg_catalog.jsonb_build_object(
    'payment_attempt_id', v_id,
    'special_reference', v_special_reference,
    'status', 'created',
    'replayed', false
  );
end;
$$;

revoke all on function public.create_payment_attempt(
  uuid, text, uuid, text, integer, text, jsonb, jsonb, jsonb, integer
) from public, anon, authenticated;
grant execute on function public.create_payment_attempt(
  uuid, text, uuid, text, integer, text, jsonb, jsonb, jsonb, integer
) to service_role;

-- ----------------------------------------------------------------------------
-- 12. COD (private.place_order) uses the order transaction as its visibility
--     boundary. Card checkout uses create_payment_attempt as its acceptance
--     boundary: once Paymob has captured the charge, a later merchant Pause
--     hides the product from new customers but cannot invalidate the already-
--     accepted attempt. Both paths pre-lock brands/products/variants in a
--     deterministic order before item processing.
--
--     Both functions are re-declared byte-identical to their prior versions
--     (private.place_order from 20260814000005_inventory_permission_
--     boundaries.sql; public.place_paid_order from the same file) except for
--     this one addition, placed directly beside each function's pre-existing
--     private.is_brand_fulfillment_transition_open(...) per-item check --
--     the same place, same per-item granularity, same distinct-exception-
--     reason convention already established there for FULFILLMENT_
--     TRANSITION_BLOCKS_ORDER and INSUFFICIENT_STOCK.
--
--     Stock remains checked/decremented by the existing per-item updates;
--     pre-locking removes the opposite-array-order deadlock window without
--     changing the established COD all-or-nothing or paid per-bucket result
--     semantics.
-- ----------------------------------------------------------------------------

create or replace function private.place_order(
  p_shipping_name text,
  p_shipping_email text,
  p_shipping_phone text,
  p_shipping_address text,
  p_shipping_city text,
  p_shipping_governorate text,
  p_user_id uuid,
  p_items jsonb,
  p_coupon_code text default null,
  p_address_id uuid default null,
  p_flat_shipping_fee_egp numeric default 0,
  p_free_shipping_threshold_egp numeric default null
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_group_id uuid;
  v_master_order_number text;
  v_mo_attempt int;
  v_bucket_keys text[] := '{}';
  v_bucket_key text;
  v_item jsonb;
  v_brand_slug text;
  v_is_partner boolean;
  v_order_id uuid;
  v_order_number text;
  v_attempt int;
  v_variant_id uuid;
  v_quantity int;
  v_price numeric(10, 2);
  v_currency text;
  v_line_total numeric(10, 2);
  v_updated int;
  v_subtotal_usd numeric(10, 2);
  v_subtotal_egp numeric(10, 2);
  v_bucket_fulfillment_type text;
  v_bucket_brand_slug text;
  v_shipping_fee numeric(10, 2);
  v_coupon public.coupons%rowtype;
  v_coupon_code text;
  v_total_subtotal_egp numeric(10, 2) := 0;
  v_total_discount_egp numeric(10, 2) := 0;
  v_discount_assigned numeric(10, 2) := 0;
  v_bucket_discount numeric(10, 2);
  v_results jsonb := '[]'::jsonb;
  v_bucket_count int;
  v_bucket_index int := 0;
  v_bucket_egp_item_count int;
  v_bucket_egp_item_seen int;
  v_bucket_discount_assigned numeric(10, 2);
  v_bucket_subtotal_egp numeric(10, 2);
  v_item_coupon_discount numeric(10, 2);
  v_original_unit_price numeric(10, 2);
  v_discount_percent_snapshot numeric(5, 2);
  v_discount_source text;
  v_last_discount_bucket_key text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART: no items to order';
  end if;

  perform private.lock_and_verify_cod_cart_visibility(p_items);

  v_mo_attempt := 0;
  loop
    v_master_order_number := 'ZK-' || lpad(floor(random() * 1000000)::text, 6, '0');
    begin
      insert into public.master_orders (master_order_number, user_id)
      values (v_master_order_number, p_user_id)
      returning id into v_group_id;
      exit;
    exception when unique_violation then
      v_mo_attempt := v_mo_attempt + 1;
      if v_mo_attempt >= 5 then
        raise exception 'Could not generate a unique master order number';
      end if;
    end;
  end loop;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_brand_slug := nullif(v_item ->> 'brand_slug', '');
    v_is_partner := false;
    if v_brand_slug is not null then
      select coalesce(is_mahaly_partner, false) into v_is_partner
      from public.brands where slug = v_brand_slug;
    end if;
    v_bucket_key := case when v_is_partner or v_brand_slug is null then '__mahaly_pool__' else v_brand_slug end;
    if not (v_bucket_key = any(v_bucket_keys)) then
      v_bucket_keys := array_append(v_bucket_keys, v_bucket_key);
    end if;
  end loop;

  v_bucket_count := array_length(v_bucket_keys, 1);

  for v_bucket_key in select unnest(v_bucket_keys)
  loop
    v_subtotal_egp := 0;
    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_brand_slug := nullif(v_item ->> 'brand_slug', '');
      v_is_partner := false;
      if v_brand_slug is not null then
        select coalesce(is_mahaly_partner, false) into v_is_partner from public.brands where slug = v_brand_slug;
      end if;
      if (case when v_is_partner or v_brand_slug is null then '__mahaly_pool__' else v_brand_slug end) = v_bucket_key
         and (v_item ->> 'currency') = 'EGP' then
        v_subtotal_egp := v_subtotal_egp + (v_item ->> 'price')::numeric * (v_item ->> 'quantity')::int;
      end if;
    end loop;
    if v_subtotal_egp > 0 then
      v_last_discount_bucket_key := v_bucket_key;
    end if;
    v_total_subtotal_egp := v_total_subtotal_egp + v_subtotal_egp;
  end loop;

  if p_coupon_code is not null and p_coupon_code <> '' then
    v_coupon_code := upper(p_coupon_code);
    select * into v_coupon from public.coupons where code = v_coupon_code for update;

    if not found then
      raise exception 'COUPON_INVALID: code not found';
    end if;
    if not v_coupon.active then
      raise exception 'COUPON_INVALID: this code is no longer active';
    end if;
    if v_coupon.expires_at is not null and v_coupon.expires_at < now() then
      raise exception 'COUPON_INVALID: this code has expired';
    end if;
    if v_coupon.max_uses is not null and v_coupon.used_count >= v_coupon.max_uses then
      raise exception 'COUPON_INVALID: this code has reached its usage limit';
    end if;

    if v_coupon.discount_type = 'percentage' then
      v_total_discount_egp := round(v_total_subtotal_egp * v_coupon.discount_value / 100, 2);
    else
      v_total_discount_egp := least(v_coupon.discount_value, v_total_subtotal_egp);
    end if;

    update public.coupons set used_count = used_count + 1 where code = v_coupon_code;
  end if;

  for v_bucket_key in select unnest(v_bucket_keys)
  loop
    v_bucket_index := v_bucket_index + 1;
    v_subtotal_egp := 0;
    v_bucket_fulfillment_type := case when v_bucket_key = '__mahaly_pool__' then 'mahaly_pool' else 'brand_direct' end;
    v_bucket_brand_slug := case when v_bucket_key = '__mahaly_pool__' then null else v_bucket_key end;

    -- Compute this bucket's EGP subtotal and line count before writing its
    -- items so the coupon can be allocated down to each line exactly.
    v_bucket_egp_item_count := 0;
    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_brand_slug := nullif(v_item ->> 'brand_slug', '');
      v_is_partner := false;
      if v_brand_slug is not null then
        select coalesce(is_mahaly_partner, false) into v_is_partner from public.brands where slug = v_brand_slug;
      end if;
      if (case when v_is_partner or v_brand_slug is null then '__mahaly_pool__' else v_brand_slug end) <> v_bucket_key then
        continue;
      end if;
      if (v_item ->> 'currency') = 'EGP' then
        v_subtotal_egp := v_subtotal_egp + (v_item ->> 'price')::numeric * (v_item ->> 'quantity')::int;
        v_bucket_egp_item_count := v_bucket_egp_item_count + 1;
      end if;
    end loop;

    if v_total_discount_egp > 0 then
      if v_bucket_key = v_last_discount_bucket_key then
        v_bucket_discount := v_total_discount_egp - v_discount_assigned;
      elsif v_subtotal_egp > 0 and v_total_subtotal_egp > 0 then
        v_bucket_discount := round(v_total_discount_egp * v_subtotal_egp / v_total_subtotal_egp, 2);
      else
        v_bucket_discount := 0;
      end if;
      v_discount_assigned := v_discount_assigned + v_bucket_discount;
    else
      v_bucket_discount := 0;
    end if;
    v_bucket_subtotal_egp := v_subtotal_egp;

    v_attempt := 0;
    loop
      v_order_number := 'LC-' || floor(100000 + random() * 900000)::text;
      begin
        insert into public.orders (
          order_number, user_id, shipping_name, shipping_email, shipping_phone,
          shipping_address, shipping_city, shipping_governorate, subtotal_usd, subtotal_egp,
          address_id, master_order_id, fulfillment_type, brand_slug
        ) values (
          v_order_number, p_user_id, p_shipping_name, p_shipping_email, p_shipping_phone,
          p_shipping_address, p_shipping_city, p_shipping_governorate, 0, 0,
          p_address_id, v_group_id, v_bucket_fulfillment_type, v_bucket_brand_slug
        )
        returning id into v_order_id;
        exit;
      exception when unique_violation then
        v_attempt := v_attempt + 1;
        if v_attempt >= 5 then
          raise exception 'Could not generate a unique order number';
        end if;
      end;
    end loop;

    v_subtotal_usd := 0;
    v_subtotal_egp := 0;
    v_bucket_egp_item_seen := 0;
    v_bucket_discount_assigned := 0;
    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_brand_slug := nullif(v_item ->> 'brand_slug', '');
      v_is_partner := false;
      if v_brand_slug is not null then
        select coalesce(is_mahaly_partner, false) into v_is_partner from public.brands where slug = v_brand_slug;
      end if;
      if (case when v_is_partner or v_brand_slug is null then '__mahaly_pool__' else v_brand_slug end) <> v_bucket_key then
        continue;
      end if;

      v_quantity := (v_item ->> 'quantity')::int;
      v_price := (v_item ->> 'price')::numeric;
      v_currency := v_item ->> 'currency';
      v_variant_id := nullif(v_item ->> 'variant_id', '')::uuid;
      v_original_unit_price := nullif(v_item ->> 'original_unit_price', '')::numeric;
      v_discount_percent_snapshot := nullif(v_item ->> 'discount_percent_snapshot', '')::numeric;
      v_discount_source := nullif(v_item ->> 'discount_source', '');

      if v_variant_id is not null then
        -- Checked SEPARATELY from the stock-availability WHERE clause
        -- (not folded into one combined condition) so the two failure
        -- modes raise distinct, non-silent exceptions -- see this
        -- migration's header comment. COD has no equivalent of the
        -- "already-charged" card-payment race (nothing is charged until
        -- the order is placed), but the same distinct-reason principle
        -- keeps this consistent with place_paid_order below.
        if private.is_brand_fulfillment_transition_open(v_brand_slug) then
          raise exception 'FULFILLMENT_TRANSITION_BLOCKS_ORDER: %', v_item ->> 'name';
        end if;

        -- CORRECTIVE PASS: lock this line's product row and recheck
        -- canonical visibility in this same transaction, immediately before
        -- the stock decrement below -- closes the gap where a product was
        -- visible when the shopper loaded checkout but was paused/hidden by
        -- its brand a moment before this COD order actually commits.
        perform 1 from public.products where id = (v_item ->> 'product_id') for update;
        if not coalesce(private.is_product_customer_visible(v_item ->> 'product_id'), false) then
          raise exception 'PRODUCT_NOT_AVAILABLE_FOR_ORDER: %', v_item ->> 'name';
        end if;

        update public.product_variants
        set quantity = quantity - v_quantity, updated_at = now()
        where id = v_variant_id
          and quantity >= v_quantity
          and selling_status = 'active';

        get diagnostics v_updated = row_count;
        if v_updated = 0 then
          raise exception 'INSUFFICIENT_STOCK: %', v_item ->> 'name';
        end if;
      end if;

      if v_currency = 'EGP' and v_bucket_discount > 0 then
        v_bucket_egp_item_seen := v_bucket_egp_item_seen + 1;
        if v_bucket_egp_item_seen = v_bucket_egp_item_count then
          v_item_coupon_discount := v_bucket_discount - v_bucket_discount_assigned;
        else
          v_item_coupon_discount := round(v_bucket_discount * (v_price * v_quantity) / v_bucket_subtotal_egp, 2);
        end if;
        v_bucket_discount_assigned := v_bucket_discount_assigned + v_item_coupon_discount;
      else
        v_item_coupon_discount := 0;
      end if;

      insert into public.order_items (
        order_id, product_id, variant_id, name, brand, brand_slug, price, currency, size, color, quantity, image,
        original_unit_price, discount_percent_snapshot, discount_source, item_coupon_discount_egp
      ) values (
        v_order_id, v_item ->> 'product_id', v_variant_id, v_item ->> 'name', v_item ->> 'brand',
        v_brand_slug, v_price, v_currency, v_item ->> 'size',
        nullif(v_item ->> 'color', ''), v_quantity, v_item ->> 'image',
        v_original_unit_price, v_discount_percent_snapshot, v_discount_source, v_item_coupon_discount
      );

      v_line_total := v_price * v_quantity;
      if v_currency = 'EGP' then
        v_subtotal_egp := v_subtotal_egp + v_line_total;
      else
        v_subtotal_usd := v_subtotal_usd + v_line_total;
      end if;
    end loop;

    if p_free_shipping_threshold_egp is not null and v_subtotal_egp >= p_free_shipping_threshold_egp then
      v_shipping_fee := 0;
    else
      v_shipping_fee := coalesce(p_flat_shipping_fee_egp, 0);
    end if;

    update public.orders
    set subtotal_usd = v_subtotal_usd,
        subtotal_egp = v_subtotal_egp,
        coupon_code = v_coupon_code,
        discount_amount_egp = v_bucket_discount,
        shipping_fee_egp = v_shipping_fee
    where id = v_order_id;

    insert into public.order_status_history (order_id, status, note)
    values (v_order_id, 'pending', null);

    v_results := v_results || jsonb_build_object(
      'order_id', v_order_id,
      'order_number', v_order_number,
      'fulfillment_type', v_bucket_fulfillment_type,
      'brand_slug', v_bucket_brand_slug,
      'shipping_fee_egp', v_shipping_fee,
      'discount_amount_egp', v_bucket_discount
    );
  end loop;

  return jsonb_build_object(
    'master_order_id', v_group_id,
    'master_order_number', v_master_order_number,
    'orders', v_results,
    'discount_amount_egp', v_total_discount_egp
  );
end;
$$;

create or replace function public.place_paid_order(p_payment_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt record;
  v_group_id uuid;
  v_master_order_number text;
  v_mo_attempt int;
  v_bucket_keys text[] := '{}';
  v_bucket_key text;
  v_item jsonb;
  v_brand_slug text;
  v_is_partner boolean;
  v_order_id uuid;
  v_order_number text;
  v_variant_id uuid;
  v_quantity int;
  v_price numeric(10, 2);
  v_currency text;
  v_line_total numeric(10, 2);
  v_updated int;
  v_subtotal_usd numeric(10, 2);
  v_subtotal_egp numeric(10, 2);
  v_bucket_fulfillment_type text;
  v_bucket_brand_slug text;
  v_bucket_brand_id uuid;
  v_shipping_fee numeric(10, 2);
  v_flat_fee numeric(10, 2);
  v_free_threshold numeric(10, 2);
  v_shipping_settings jsonb;
  v_attempt_no int;
  v_any_fulfilled boolean;
  v_any_failed boolean;
  v_had_prior_fulfillment boolean;
  v_original_unit_price numeric(10, 2);
  v_discount_percent_snapshot numeric(5, 2);
  v_discount_source text;
  v_item_coupon_discount numeric(10, 2);
  v_bucket_discount_egp numeric(10, 2);
  v_coupon_code text;
begin
  select * into v_attempt from public.payment_attempts where id = p_payment_attempt_id for update;
  if not found then
    raise exception 'PAYMENT_ATTEMPT_NOT_FOUND';
  end if;

  if v_attempt.status in ('fulfilled', 'fulfillment_failed') then
    return jsonb_build_object(
      'payment_attempt_id', p_payment_attempt_id,
      'status', v_attempt.status,
      'master_order_id', v_attempt.master_order_id,
      'replayed', true
    );
  end if;

  if v_attempt.status not in ('paid', 'reflecting') then
    raise exception 'PAYMENT_ATTEMPT_NOT_PAID: current status is %, expected paid', v_attempt.status;
  end if;

  if v_attempt.status = 'paid' then
    update public.payment_attempts set status = 'reflecting', updated_at = now() where id = p_payment_attempt_id;
  end if;

  -- The durable payment attempt is the authorization boundary for card
  -- purchases. It was accepted only after canonical visibility was checked
  -- under row locks. Re-lock the same rows deterministically for fulfillment,
  -- but do not reinterpret a later merchant Pause as grounds to discard an
  -- already-captured payment.
  perform private.lock_and_verify_intention_cart_visibility(v_attempt.cart_snapshot, false, false);
  perform set_config('app.paid_attempt_fulfillment_in_progress', 'on', true);

  v_group_id := v_attempt.master_order_id;
  v_coupon_code := nullif(v_attempt.coupon_snapshot ->> 'code', '');

  select exists (
    select 1 from private.payment_attempt_fulfillments
    where payment_attempt_id = p_payment_attempt_id and status = 'fulfilled'
  ) into v_had_prior_fulfillment;

  select value into v_shipping_settings from public.site_content where key = 'shipping_settings';
  v_flat_fee := coalesce((v_shipping_settings ->> 'flatDeliveryFeeEgp')::numeric, 50);
  v_free_threshold := coalesce((v_shipping_settings ->> 'freeShippingThresholdEgp')::numeric, 1500);

  for v_item in select * from jsonb_array_elements(v_attempt.cart_snapshot)
  loop
    v_brand_slug := nullif(v_item ->> 'brandSlug', '');
    v_is_partner := false;
    if v_brand_slug is not null then
      select coalesce(is_mahaly_partner, false) into v_is_partner from public.brands where slug = v_brand_slug;
    end if;
    v_bucket_key := case when v_is_partner or v_brand_slug is null then '__mahaly_pool__' else v_brand_slug end;
    if not (v_bucket_key = any(v_bucket_keys)) then
      v_bucket_keys := array_append(v_bucket_keys, v_bucket_key);
    end if;
  end loop;

  if v_group_id is null and exists (
    select 1 from unnest(v_bucket_keys) as bk(key)
    where not exists (
      select 1 from private.payment_attempt_fulfillments
      where payment_attempt_id = p_payment_attempt_id and bucket_key = bk.key and status = 'fulfilled'
    )
  ) then
    v_mo_attempt := 0;
    loop
      v_master_order_number := 'ZK-' || lpad(floor(random() * 1000000)::text, 6, '0');
      begin
        insert into public.master_orders (master_order_number, user_id)
        values (v_master_order_number, v_attempt.user_id)
        returning id into v_group_id;
        exit;
      exception when unique_violation then
        v_mo_attempt := v_mo_attempt + 1;
        if v_mo_attempt >= 5 then
          raise exception 'Could not generate a unique master order number';
        end if;
      end;
    end loop;
  end if;

  for v_bucket_key in select unnest(v_bucket_keys)
  loop
    if exists (
      select 1 from private.payment_attempt_fulfillments
      where payment_attempt_id = p_payment_attempt_id and bucket_key = v_bucket_key and status = 'fulfilled'
    ) then
      continue;
    end if;

    begin
      v_bucket_fulfillment_type := case when v_bucket_key = '__mahaly_pool__' then 'mahaly_pool' else 'brand_direct' end;
      v_bucket_brand_slug := case when v_bucket_key = '__mahaly_pool__' then null else v_bucket_key end;
      v_bucket_brand_id := null;
      if v_bucket_brand_slug is not null then
        select id into v_bucket_brand_id from public.brands where slug = v_bucket_brand_slug;
      end if;

      v_subtotal_usd := 0;
      v_subtotal_egp := 0;
      v_bucket_discount_egp := 0;

      v_attempt_no := 0;
      loop
        v_order_number := 'LC-' || floor(100000 + random() * 900000)::text;
        begin
          insert into public.orders (
            order_number, user_id, status, payment_method, payment_status, payment_attempt_id,
            shipping_name, shipping_email, shipping_phone, shipping_address, shipping_city, shipping_governorate,
            subtotal_usd, subtotal_egp, master_order_id, fulfillment_type, brand_slug
          ) values (
            v_order_number, v_attempt.user_id, 'paid', 'card', 'paid', p_payment_attempt_id,
            btrim(coalesce(v_attempt.shipping_snapshot ->> 'firstName', '') || ' ' || coalesce(v_attempt.shipping_snapshot ->> 'lastName', '')),
            v_attempt.shipping_snapshot ->> 'email',
            v_attempt.shipping_snapshot ->> 'phone',
            v_attempt.shipping_snapshot ->> 'address',
            v_attempt.shipping_snapshot ->> 'city',
            v_attempt.shipping_snapshot ->> 'governorate',
            0, 0, v_group_id, v_bucket_fulfillment_type, v_bucket_brand_slug
          )
          returning id into v_order_id;
          exit;
        exception when unique_violation then
          v_attempt_no := v_attempt_no + 1;
          if v_attempt_no >= 5 then
            raise exception 'Could not generate a unique order number';
          end if;
        end;
      end loop;

      for v_item in select * from jsonb_array_elements(v_attempt.cart_snapshot)
      loop
        v_brand_slug := nullif(v_item ->> 'brandSlug', '');
        v_is_partner := false;
        if v_brand_slug is not null then
          select coalesce(is_mahaly_partner, false) into v_is_partner from public.brands where slug = v_brand_slug;
        end if;
        if (case when v_is_partner or v_brand_slug is null then '__mahaly_pool__' else v_brand_slug end) <> v_bucket_key then
          continue;
        end if;

        v_quantity := (v_item ->> 'quantity')::int;
        v_price := (v_item ->> 'price')::numeric;
        v_currency := v_item ->> 'currency';
        v_variant_id := nullif(v_item ->> 'variantId', '')::uuid;
        v_original_unit_price := nullif(v_item ->> 'originalUnitPrice', '')::numeric;
        v_discount_percent_snapshot := nullif(v_item ->> 'discountPercentSnapshot', '')::numeric;
        v_discount_source := nullif(v_item ->> 'discountSource', '');
        v_item_coupon_discount := coalesce(nullif(v_item ->> 'itemCouponDiscountEgp', '')::numeric, 0);

        if v_variant_id is not null then
          -- Card-payment race, item 3: the customer has ALREADY been
          -- charged by Paymob by the time this runs -- a bare
          -- INSUFFICIENT_STOCK here would misattribute the failure to a
          -- stock problem and bury the real cause. Checked separately so
          -- the recorded failure_reason (private.payment_attempt_fulfillments,
          -- surfaced in the admin Payments UI) is unambiguous:
          -- FULFILLMENT_TRANSITION_BLOCKS_ORDER means "the brand started a
          -- transition after this payment began -- this charge needs manual
          -- review/refund," never silently folded into an ordinary stockout.
          -- request_fulfillment_mode_transition's OPEN_PAYMENT_ATTEMPT_PENDING
          -- blocker (20260814000002_fulfillment_mode.sql) and the intention
          -- route's own pre-charge rejection are what make this rare in
          -- practice; this is the last-resort safety net for the residual
          -- true-concurrency window between the two.
          if private.is_brand_fulfillment_transition_open(v_brand_slug) then
            raise exception 'FULFILLMENT_TRANSITION_BLOCKS_ORDER: %', v_item ->> 'name';
          end if;

          update public.product_variants
          set quantity = quantity - v_quantity, updated_at = now()
          where id = v_variant_id and quantity >= v_quantity and selling_status = 'active';

          get diagnostics v_updated = row_count;
          if v_updated = 0 then
            raise exception 'INSUFFICIENT_STOCK: %', v_item ->> 'name';
          end if;
        end if;

        insert into public.order_items (
          order_id, product_id, variant_id, name, brand, brand_slug, price, currency, size, color, quantity, image,
          original_unit_price, discount_percent_snapshot, discount_source, item_coupon_discount_egp
        ) values (
          v_order_id, v_item ->> 'productId', v_variant_id, v_item ->> 'name', v_item ->> 'brand',
          v_brand_slug, v_price, v_currency, v_item ->> 'size', nullif(v_item ->> 'color', ''), v_quantity,
          coalesce(v_item ->> 'image', ''),
          v_original_unit_price, v_discount_percent_snapshot, v_discount_source, v_item_coupon_discount
        );

        v_line_total := v_price * v_quantity;
        if v_currency = 'EGP' then
          v_subtotal_egp := v_subtotal_egp + v_line_total;
          v_bucket_discount_egp := v_bucket_discount_egp + v_item_coupon_discount;
        else
          v_subtotal_usd := v_subtotal_usd + v_line_total;
        end if;
      end loop;

      if v_subtotal_egp >= v_free_threshold then
        v_shipping_fee := 0;
      else
        v_shipping_fee := v_flat_fee;
      end if;

      update public.orders
      set subtotal_usd = v_subtotal_usd,
          subtotal_egp = v_subtotal_egp,
          shipping_fee_egp = v_shipping_fee,
          coupon_code = case when v_bucket_discount_egp > 0 then v_coupon_code else null end,
          discount_amount_egp = v_bucket_discount_egp
      where id = v_order_id;

      insert into public.order_status_history (order_id, status, note)
      values (v_order_id, 'paid', 'Card payment confirmed via Paymob webhook');

      insert into private.payment_attempt_fulfillments (
        payment_attempt_id, bucket_key, brand_id, status, order_id, expected_amount_cents, fulfilled_at
      ) values (
        p_payment_attempt_id, v_bucket_key, v_bucket_brand_id, 'fulfilled', v_order_id,
        round((v_subtotal_egp - v_bucket_discount_egp + v_shipping_fee) * 100)::int, now()
      )
      on conflict (payment_attempt_id, bucket_key) do update set
        status = 'fulfilled',
        order_id = excluded.order_id,
        expected_amount_cents = excluded.expected_amount_cents,
        failure_reason = null,
        fulfilled_at = now(),
        updated_at = now();

    exception when others then
      insert into private.payment_attempt_fulfillments (
        payment_attempt_id, bucket_key, brand_id, status, expected_amount_cents, failure_reason
      ) values (
        p_payment_attempt_id, v_bucket_key, v_bucket_brand_id, 'failed', 0, sqlerrm
      )
      on conflict (payment_attempt_id, bucket_key) do update set
        status = 'failed',
        failure_reason = excluded.failure_reason,
        updated_at = now();
    end;
  end loop;

  select
    coalesce(bool_or(status = 'fulfilled'), false),
    coalesce(bool_or(status = 'failed'), false)
  into v_any_fulfilled, v_any_failed
  from private.payment_attempt_fulfillments
  where payment_attempt_id = p_payment_attempt_id;

  if v_coupon_code is not null and v_any_fulfilled and not v_had_prior_fulfillment then
    update public.coupons set used_count = used_count + 1 where code = v_coupon_code;
  end if;

  if v_any_fulfilled then
    update public.payment_attempts
    set status = 'fulfilled', master_order_id = v_group_id, processed_at = now(), updated_at = now()
    where id = p_payment_attempt_id;
  else
    update public.payment_attempts
    set status = 'fulfillment_failed', processed_at = now(), updated_at = now()
    where id = p_payment_attempt_id;
  end if;

  return jsonb_build_object(
    'payment_attempt_id', p_payment_attempt_id,
    'status', case when v_any_fulfilled then 'fulfilled' else 'fulfillment_failed' end,
    'master_order_id', case when v_any_fulfilled then v_group_id else null end,
    'is_partial', (v_any_fulfilled and v_any_failed),
    'replayed', false
  );
end;
$$;

;
