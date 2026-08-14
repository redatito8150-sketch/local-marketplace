-- ============================================================================
-- Product archive/deletion lifecycle.
--
-- Replaces two unsafe behaviors:
--   1. Brand Portal `DELETE /api/brand-portal/products/[id]` used to only
--      archive the product while the UI called it "Request deletion" and
--      promised staff review that never happened.
--   2. Admin `DELETE /api/admin/products/[id]` (and the bulk "delete"
--      action) did a raw, unguarded `delete from products` with no
--      dependency checks and no per-row success reporting.
--
-- This migration adds:
--   - `product_deletion_requests`, a real workflow table (requested ->
--     under_review/blocked -> approved/rejected/cancelled -> completed),
--     at most one non-terminal request per product (partial unique index),
--     `product_id` nullable/ON DELETE SET NULL with immutable name/sku/
--     image snapshot columns so a *completed* request's audit record
--     survives the product row it refers to actually being deleted.
--   - A canonical, database-authoritative eligibility calculation
--     (`private.compute_product_deletion_eligibility`) that separates
--     IMMUTABLE history (permanently blocks deletion, sets
--     mustRetainHistory) from OPERATIONAL state (blocks the current
--     action, resolvable) from pristine-draft-only checks (never leak
--     into the request/approval blocker set) — this is what makes
--     approval possible at all; see this file's own corrective-pass
--     comments below for the exact bug this replaced.
--   - Transaction-safe lifecycle RPCs (archive / restore / delete-pristine-
--     draft / request / cancel / admin review-reject-approve / emergency
--     hide), each locking the product row (and its variants, in the same
--     lock order every time) and recomputing blockers inside the same
--     transaction rather than trusting an earlier UI preflight.
--   - A defense-in-depth `order_items` insert guard, resolving the
--     product through `variant_id` when `product_id` is null, so an
--     archived/draft product can never gain a new order line even via a
--     direct RPC call that skips the app-layer cart/checkout checks.
--   - A `storefront_products` view fix so archived/paused/inactive-brand
--     products are excluded for *every* reader, including service-role
--     reads that bypass RLS (the view previously relied on the RLS
--     policy alone for that filtering).
--   - `private.admin_search_deletion_requests`, a single paginated,
--     filtered, database-level search RPC for the admin review queue —
--     status/brand/partner/text filters and LIMIT/OFFSET all applied
--     before any row leaves Postgres, never loaded into memory first.
--
-- `products.deletion_requested_at` predates this migration and was never
-- read or written by any existing code path (confirmed dead column). It
-- is kept for backward-compatible display purposes only, kept in sync by
-- trigger from `product_deletion_requests` (set while a request is
-- non-terminal, cleared once resolved) — never treated as the source of
-- truth by anything new in this migration.
--
-- CORRECTIVE PASS (on top of the original version of this same,
-- never-applied migration): the first version made successful approval
-- structurally impossible — `product_id` was NOT NULL with `ON DELETE
-- RESTRICT` (so the delete inside admin_approve_product_deletion would
-- always fail), and the eligibility calculation added `PRODUCT_NOT_DRAFT`
-- for every archived product and `DELETION_REQUEST_ALREADY_OPEN` for the
-- very request being approved, so approval always reported blockers
-- against itself. Fixed below by (a) making `product_id` nullable / ON
-- DELETE SET NULL with a name/sku/image snapshot, (b) splitting
-- eligibility into immutable-vs-operational-vs-pristine-only checks so
-- PRODUCT_NOT_DRAFT/PRODUCT_EVER_PUBLISHED never leak into the
-- request/approval blocker set, and (c) an explicit `p_ignore_request_id`
-- parameter so a request never counts itself as a blocker against its own
-- approval/review. See each function's own comment for the specific fix.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. product_deletion_requests
-- ----------------------------------------------------------------------------

-- Needed up front for the product_name trigram index below, and reused by
-- private.admin_search_deletion_requests's ILIKE search (section 7).
create extension if not exists pg_trgm;

create table if not exists public.product_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  -- Nullable + ON DELETE SET NULL (not the original NOT NULL / RESTRICT):
  -- a *completed* request must outlive the product it refers to once that
  -- product is actually, permanently deleted. The snapshot columns below
  -- are what keep the record meaningful once product_id goes null.
  product_id text references public.products(id) on delete set null,
  product_name text not null default '',
  product_sku text,
  product_image text,
  brand_id uuid not null references public.brands(id) on delete restrict,
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_label text not null,
  requested_at timestamptz not null default now(),
  reason text not null,
  status text not null default 'requested' check (status in (
    'requested', 'under_review', 'blocked', 'approved', 'rejected', 'cancelled', 'completed'
  )),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  admin_note text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  -- Full ProductDeletionEligibility snapshot captured at request time, for
  -- comparison against the recomputed-at-approval-time blockers — the
  -- brand's original submission vs. what's actually blocking it now.
  blocker_snapshot jsonb not null default '[]'::jsonb,
  -- Idempotency: a replayed identical request (same product, same actor,
  -- same key, same reason) returns the existing open request instead of
  -- creating a duplicate row. A replay with the same key but a different
  -- actor/reason is a real conflict, not a safe no-op — see
  -- request_product_deletion's own comment.
  operation_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one non-terminal request per product. product_id is only ever
-- null once status = 'completed' (a terminal state outside this partial
-- index's filter), so this constraint is unaffected by the nullable FK.
create unique index if not exists product_deletion_requests_one_open_per_product_idx
  on public.product_deletion_requests (product_id)
  where status in ('requested', 'under_review', 'blocked');

create index if not exists product_deletion_requests_brand_status_idx
  on public.product_deletion_requests (brand_id, status, requested_at desc);
create index if not exists product_deletion_requests_status_idx
  on public.product_deletion_requests (status, requested_at desc);
create unique index if not exists product_deletion_requests_operation_key_idx
  on public.product_deletion_requests (product_id, operation_key)
  where operation_key is not null;
-- Case-insensitive search support for the admin review queue's paginated
-- search RPC (private.admin_search_deletion_requests below).
create index if not exists product_deletion_requests_product_name_trgm_idx
  on public.product_deletion_requests using gin (lower(product_name) gin_trgm_ops);

alter table public.product_deletion_requests enable row level security;
-- No RLS policy is added on purpose, matching this codebase's established
-- convention for `products`/`brands`/`orders` writes: every read and write
-- path goes through server-side code using the service_role key
-- (lib/data/brandPortal.ts, lib/data/admin.ts), never the browser anon
-- key. RLS-enabled-with-no-policy means "deny by default" for anon/
-- authenticated, which is the safe posture until/unless a client-side
-- read path is ever added.

-- Corrective pass: the original grant omitted DELETE entirely, so nothing
-- (including this project's own integration test cleanup helpers) could
-- ever remove a product_deletion_requests row directly. There's no
-- production feature that hard-deletes a request row today, but the
-- service_role should still be able to (e.g. a future data-retention
-- sweep, or test/staging cleanup) rather than being silently unable to.
revoke all on public.product_deletion_requests from public, anon, authenticated;
grant select, insert, update, delete on public.product_deletion_requests to service_role;

-- ----------------------------------------------------------------------------
-- 2. deletion_requested_at compatibility mirror (display-only, never
--    authoritative — every RPC below reads/writes product_deletion_requests
--    directly, never this column).
-- ----------------------------------------------------------------------------

create or replace function private.sync_product_deletion_requested_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.product_id is null then
      return old;
    end if;
    update public.products
      set deletion_requested_at = (
        select requested_at from public.product_deletion_requests
        where product_id = old.product_id and status in ('requested', 'under_review', 'blocked')
        order by requested_at desc limit 1
      )
      where id = old.product_id;
    return old;
  end if;

  if new.product_id is null then
    return new;
  end if;
  update public.products
    set deletion_requested_at = case
      when new.status in ('requested', 'under_review', 'blocked') then new.requested_at
      else null
    end
    where id = new.product_id;
  return new;
end;
$$;

drop trigger if exists product_deletion_requests_sync_mirror on public.product_deletion_requests;
create trigger product_deletion_requests_sync_mirror
after insert or update of status or delete on public.product_deletion_requests
for each row execute function private.sync_product_deletion_requested_at();

revoke all on function private.sync_product_deletion_requested_at() from public, anon, authenticated;

comment on column public.products.deletion_requested_at is
  'Display-only mirror of the current non-terminal product_deletion_requests row (if any), kept in sync by trigger. Never authoritative — read product_deletion_requests for real workflow state.';

-- ----------------------------------------------------------------------------
-- 3. Canonical eligibility calculation
--
-- CORRECTIVE PASS: blockers are now split into three disjoint groups so
-- they can never leak into the wrong decision:
--   - IMMUTABLE  (reviews / order history / inventory history / warehouse
--     history / return history): sets mustRetainHistory = true. Blocks
--     canRequestDeletion and approval FOREVER — request_product_deletion
--     refuses to even create a request when any of these are present
--     (item 4: never offer a deletion request that can never succeed).
--   - OPERATIONAL (open orders / available or reserved or incoming stock /
--     open warehouse document / quarantine / open return / open
--     fulfillment transition): does not set mustRetainHistory. Still
--     blocks canDeleteImmediately and canRequestDeletion, but a request
--     filed while one of these is present is created as 'blocked' (not
--     refused outright) since these can resolve over time.
--   - PRISTINE-DRAFT-ONLY (PRODUCT_NOT_DRAFT / PRODUCT_EVER_PUBLISHED):
--     never added to the shared blockers array at all — they only feed
--     canDeleteImmediately's own boolean. The original bug added
--     PRODUCT_NOT_DRAFT for every archived product being evaluated for a
--     *request* (not an immediate-delete), which made mustRetainHistory-
--     style logic irrelevant since the generic "any blockers -> refuse"
--     checks downstream always tripped on this alone.
-- `p_ignore_request_id`: when recomputing eligibility on behalf of a
-- specific request (admin review/approve), that request's own
-- DELETION_REQUEST_ALREADY_OPEN state must never count against itself —
-- the original bug had no such exclusion, so admin_approve_product_deletion
-- always saw its own request as a blocker and could never succeed.
-- ----------------------------------------------------------------------------

create or replace function private.append_deletion_blocker(
  p_blockers jsonb, p_code text, p_category text, p_message text,
  p_count integer default null, p_quantity numeric default null
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select p_blockers || jsonb_build_object(
    'code', p_code, 'category', p_category, 'message', p_message,
    'count', p_count, 'quantity', p_quantity
  );
$$;

revoke all on function private.append_deletion_blocker(jsonb, text, text, text, integer, numeric) from public, anon, authenticated;

create or replace function private.compute_product_deletion_eligibility(
  p_product_id text,
  p_ignore_request_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_product record;
  v_blockers jsonb := '[]'::jsonb;
  v_must_retain boolean := false;
  v_pristine boolean := true;
  v_open_request_id uuid;
  v_open_request_excluding_self boolean;
  v_cnt integer;
  v_qty numeric;
  v_lifecycle text;
  v_can_archive boolean;
  v_can_restore boolean;
  v_can_delete_now boolean;
  v_can_request boolean;
begin
  select * into v_product from public.products where id = p_product_id;
  if not found then
    return jsonb_build_object(
      'productId', p_product_id,
      'lifecycle', 'draft',
      'canArchive', false,
      'canRestore', false,
      'canDeleteImmediately', false,
      'canRequestDeletion', false,
      'mustRetainHistory', false,
      'blockers', jsonb_build_array(jsonb_build_object(
        'code', 'PRODUCT_NOT_FOUND', 'category', 'other',
        'message', 'This product no longer exists.', 'count', null, 'quantity', null
      ))
    );
  end if;

  -- ===== IMMUTABLE (permanent — sets mustRetainHistory) =====

  select count(*) into v_cnt from public.reviews where product_id = p_product_id;
  if v_cnt > 0 then
    v_must_retain := true;
    v_pristine := false;
    v_blockers := private.append_deletion_blocker(v_blockers, 'PRODUCT_HAS_REVIEWS', 'reviews', format('This product has %s published review(s) and must be retained.', v_cnt), v_cnt, null);
  end if;

  select count(*) into v_cnt
  from public.order_items oi
  where oi.product_id = p_product_id
     or oi.variant_id in (select id from public.product_variants where product_id = p_product_id);
  if v_cnt > 0 then
    v_must_retain := true;
    v_pristine := false;
    v_blockers := private.append_deletion_blocker(v_blockers, 'PRODUCT_HAS_ORDER_HISTORY', 'orders', format('This product appears in %s order line item(s) and must be retained.', v_cnt), v_cnt, null);
  end if;

  select count(*) into v_cnt from public.inventory_movements where product_id = p_product_id;
  if v_cnt > 0 then
    v_must_retain := true;
    v_pristine := false;
    v_blockers := private.append_deletion_blocker(v_blockers, 'PRODUCT_HAS_INVENTORY_HISTORY', 'inventory', format('This product has %s inventory movement record(s) and must be retained.', v_cnt), v_cnt, null);
  end if;

  select count(*) into v_cnt
  from public.warehouse_transfer_items wti
  where wti.variant_id in (select id from public.product_variants where product_id = p_product_id);
  if v_cnt > 0 then
    v_must_retain := true;
    v_pristine := false;
    v_blockers := private.append_deletion_blocker(v_blockers, 'PRODUCT_HAS_WAREHOUSE_HISTORY', 'warehouse', format('This product appears on %s warehouse document line(s) and must be retained.', v_cnt), v_cnt, null);
  end if;

  select count(*) into v_cnt
  from public.warehouse_transfer_items wti
  join public.warehouse_transfers wt on wt.id = wti.transfer_id
  where wt.direction = 'to_brand'
    and wti.variant_id in (select id from public.product_variants where product_id = p_product_id);
  if v_cnt > 0 then
    v_must_retain := true;
    v_pristine := false;
    v_blockers := private.append_deletion_blocker(v_blockers, 'PRODUCT_HAS_RETURN_HISTORY', 'returns', format('This product has %s return record(s) and must be retained.', v_cnt), v_cnt, null);
  end if;

  -- ===== OPERATIONAL (resolvable — does not set mustRetainHistory) =====

  select count(*) into v_cnt
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where (oi.product_id = p_product_id
     or oi.variant_id in (select id from public.product_variants where product_id = p_product_id))
    and o.status not in ('fulfilled', 'cancelled');
  if v_cnt > 0 then
    v_pristine := false;
    v_blockers := private.append_deletion_blocker(v_blockers, 'PRODUCT_HAS_OPEN_ORDERS', 'orders', format('This product has %s open (unfulfilled) order(s).', v_cnt), v_cnt, null);
  end if;

  select coalesce(sum(quantity), 0) into v_qty from public.product_variants where product_id = p_product_id;
  if v_qty > 0 then
    v_pristine := false;
    v_blockers := private.append_deletion_blocker(v_blockers, 'PRODUCT_HAS_AVAILABLE_STOCK', 'inventory', format('This product still has %s unit(s) of sellable stock.', v_qty), null, v_qty);
  end if;

  select coalesce(sum(brand_stock_quantity), 0) into v_qty from public.product_variants where product_id = p_product_id;
  if v_qty > 0 then
    v_pristine := false;
    v_blockers := private.append_deletion_blocker(v_blockers, 'PRODUCT_HAS_RESERVED_STOCK', 'inventory', format('This product has %s unit(s) of brand-held/declared stock.', v_qty), null, v_qty);
  end if;

  select coalesce(sum(wti.requested_qty - coalesce(wti.received_ok_qty, 0) - coalesce(wti.damaged_qty, 0) - coalesce(wti.missing_qty, 0)), 0) into v_qty
  from public.warehouse_transfer_items wti
  join public.warehouse_transfers wt on wt.id = wti.transfer_id
  where wt.direction = 'to_local'
    and wt.status not in ('received', 'rejected', 'cancelled')
    and wti.variant_id in (select id from public.product_variants where product_id = p_product_id);
  if v_qty > 0 then
    v_pristine := false;
    v_blockers := private.append_deletion_blocker(v_blockers, 'PRODUCT_HAS_INCOMING_STOCK', 'inventory', format('This product has %s unit(s) still incoming from a brand shipment.', v_qty), null, v_qty);
  end if;

  select count(*) into v_cnt
  from public.warehouse_transfer_items wti
  join public.warehouse_transfers wt on wt.id = wti.transfer_id
  where wt.status not in ('received', 'rejected', 'cancelled')
    and wti.variant_id in (select id from public.product_variants where product_id = p_product_id);
  if v_cnt > 0 then
    v_pristine := false;
    v_blockers := private.append_deletion_blocker(v_blockers, 'PRODUCT_HAS_OPEN_WAREHOUSE_DOCUMENT', 'warehouse', format('This product has %s open warehouse document(s) in progress.', v_cnt), v_cnt, null);
  end if;

  select count(*) into v_cnt
  from public.warehouse_transfer_items wti
  where wti.variant_id in (select id from public.product_variants where product_id = p_product_id)
    and (coalesce(wti.damaged_qty, 0) > 0 or coalesce(wti.missing_qty, 0) > 0)
    and wti.quarantine_resolved_at is null;
  if v_cnt > 0 then
    v_pristine := false;
    v_blockers := private.append_deletion_blocker(v_blockers, 'PRODUCT_HAS_QUARANTINE', 'warehouse', format('This product has %s unresolved damaged/missing warehouse line(s).', v_cnt), v_cnt, null);
  end if;

  select count(*) into v_cnt
  from public.warehouse_transfer_items wti
  join public.warehouse_transfers wt on wt.id = wti.transfer_id
  where wt.direction = 'to_brand'
    and wt.status not in ('received', 'rejected', 'cancelled')
    and wti.variant_id in (select id from public.product_variants where product_id = p_product_id);
  if v_cnt > 0 then
    v_pristine := false;
    v_blockers := private.append_deletion_blocker(v_blockers, 'PRODUCT_HAS_OPEN_RETURN', 'returns', format('This product has %s open return(s) in progress.', v_cnt), v_cnt, null);
  end if;

  select count(*) into v_cnt
  from public.brand_fulfillment_transitions
  where brand_id = v_product.brand_id
    and status not in ('completed', 'cancelled', 'failed');
  if v_cnt > 0 then
    v_pristine := false;
    v_blockers := private.append_deletion_blocker(v_blockers, 'PRODUCT_HAS_OPEN_FULFILLMENT_TRANSITION', 'transition', 'This product''s brand has an open fulfillment-mode transition in progress.', v_cnt, null);
  end if;

  -- ===== PRISTINE-DRAFT-ONLY (never added to the shared blockers array) =====
  -- Purely local to canDeleteImmediately's own check — an archived,
  -- previously-published product must never see PRODUCT_NOT_DRAFT or
  -- PRODUCT_EVER_PUBLISHED in its blockers, since neither has any bearing
  -- on whether it can be *requested*/*approved* for deletion.
  if v_product.status <> 'draft' or v_product.publish_date is not null or v_product.first_stocked_at is not null then
    v_pristine := false;
  end if;

  -- ===== Open deletion request (excluding the request currently being
  -- evaluated, if any) =====
  select id into v_open_request_id from public.product_deletion_requests
  where product_id = p_product_id and status in ('requested', 'under_review', 'blocked')
  limit 1;
  v_open_request_excluding_self := v_open_request_id is not null
    and (p_ignore_request_id is null or v_open_request_id <> p_ignore_request_id);
  if v_open_request_excluding_self then
    v_blockers := private.append_deletion_blocker(v_blockers, 'DELETION_REQUEST_ALREADY_OPEN', 'other', 'A deletion request is already open for this product.', null, null);
  end if;

  v_lifecycle := case
    when v_must_retain then 'historical'
    when v_product.status = 'archived' then 'archived'
    when v_product.status = 'published' then 'active'
    else 'draft'
  end;

  v_can_archive := v_product.status <> 'archived';
  v_can_restore := v_product.status = 'archived' and v_open_request_id is null;
  v_can_delete_now := v_pristine and v_product.status = 'draft' and v_open_request_id is null;
  -- Deliberately only excludes the ignored request, not "any open
  -- request" — when recomputing on behalf of the very request being
  -- approved/reviewed (p_ignore_request_id set), that request's own
  -- still-open row must not make canRequestDeletion look false for
  -- reasons unrelated to what's actually being decided.
  v_can_request := v_product.status = 'archived' and not v_must_retain and not v_open_request_excluding_self;

  return jsonb_build_object(
    'productId', p_product_id,
    'lifecycle', v_lifecycle,
    'canArchive', v_can_archive,
    'canRestore', v_can_restore,
    'canDeleteImmediately', v_can_delete_now,
    'canRequestDeletion', v_can_request,
    'mustRetainHistory', v_must_retain,
    'blockers', v_blockers
  );
end;
$$;

revoke all on function private.compute_product_deletion_eligibility(text, uuid) from public, anon, authenticated;

create or replace function public.get_product_deletion_eligibility(p_product_id text, p_ignore_request_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.compute_product_deletion_eligibility(p_product_id, p_ignore_request_id);
$$;

revoke all on function public.get_product_deletion_eligibility(text, uuid) from public, anon, authenticated;
grant execute on function public.get_product_deletion_eligibility(text, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 4. Lifecycle RPCs
--
-- Every RPC below: locks the product row `for update` first (then variant
-- rows `for update`, same order every time), recomputes eligibility inside
-- the same transaction, never trusts a stale client-supplied eligibility
-- snapshot, and returns a stable jsonb envelope of the shape
-- {ok, code, message, lifecycle, requestState, blockers}. `p_brand_id`
-- non-null means "verify this product belongs to this brand" (brand-portal
-- callers); null means the caller has already been authorized as admin at
-- the application layer.
-- ----------------------------------------------------------------------------

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
    -- Idempotent: calling archive on an already-archived product is a
    -- safe no-op, not an error.
    return jsonb_build_object('ok', true, 'code', 'ALREADY_ARCHIVED', 'message', 'Already archived.', 'lifecycle', 'archived');
  end if;

  update public.products set status = 'archived' where id = p_product_id;

  return jsonb_build_object('ok', true, 'code', 'ARCHIVED', 'message', 'Product archived.', 'lifecycle', 'archived', 'before', to_jsonb(v_product));
end;
$$;

revoke all on function public.archive_product(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.archive_product(text, uuid, uuid, text) to service_role;

-- CORRECTIVE PASS (item 6): restore now verifies full baseline
-- publish-readiness, not just "at least one active variant exists" —
-- required product fields, direct-brand sellable stock, and the
-- partner-brand launch gate are all re-checked so an archived product
-- can never come back published in an unsellable/incomplete state. This
-- is a core-readiness subset (the fields already stored on the `products`
-- row plus variant/stock/launch state), not a re-implementation of the
-- full multi-field form validation in lib/admin/productValidation.ts.
create or replace function public.restore_product(
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
  v_brand record;
  v_active_variants integer;
  v_sellable_stock numeric;
  v_open_request record;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'This product no longer exists.');
  end if;
  if p_brand_id is not null and v_product.brand_id <> p_brand_id then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_OWNED', 'message', 'You do not have access to this product.');
  end if;
  if v_product.status <> 'archived' then
    return jsonb_build_object('ok', false, 'code', 'DELETION_REQUEST_STATE_CONFLICT', 'message', 'Only an archived product can be restored.');
  end if;

  perform id from public.product_variants where product_id = p_product_id for update;

  select * into v_open_request from public.product_deletion_requests
  where product_id = p_product_id and status in ('requested', 'under_review', 'blocked') for update;
  if found then
    return jsonb_build_object('ok', false, 'code', 'DELETION_REQUEST_ALREADY_OPEN', 'message', 'Cancel the open deletion request before restoring this product.');
  end if;

  select * into v_brand from public.brands where id = v_product.brand_id;
  if not found or v_brand.is_active <> true then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHORIZED', 'message', 'This brand is not active, so its products cannot be restored.');
  end if;

  if coalesce(nullif(trim(v_product.name), ''), '') = '' or v_product.price is null or v_product.price <= 0 or coalesce(nullif(trim(v_product.image), ''), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_MISSING_REQUIRED_FIELDS', 'message', 'This product is missing required fields (name, price, or image) and cannot be republished as-is.');
  end if;

  select count(*) into v_active_variants from public.product_variants
  where product_id = p_product_id and is_archived = false and selling_status = 'active';
  if v_active_variants = 0 then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_DRAFT', 'message', 'This product has no active, sellable variants — add or restore at least one variant before restoring.');
  end if;

  if v_brand.is_mahaly_partner then
    if v_product.first_stocked_at is null then
      return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_LAUNCHED', 'message', 'This Zakhnook-fulfilled product has never actually been launched (no stock has ever been received for it) — it cannot be restored until Zakhnook has received real stock.');
    end if;
  else
    select coalesce(sum(quantity), 0) into v_sellable_stock from public.product_variants
    where product_id = p_product_id and is_archived = false and selling_status = 'active';
    if v_sellable_stock <= 0 then
      return jsonb_build_object('ok', false, 'code', 'PRODUCT_NO_SELLABLE_STOCK', 'message', 'This product has no sellable stock on any active variant — add stock before restoring.');
    end if;
  end if;

  update public.products set status = 'published' where id = p_product_id;

  return jsonb_build_object('ok', true, 'code', 'RESTORED', 'message', 'Product restored.', 'lifecycle', 'active', 'before', to_jsonb(v_product));
end;
$$;

revoke all on function public.restore_product(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.restore_product(text, uuid, uuid, text) to service_role;

-- CORRECTIVE PASS (item 8): captures the product's own owned media URLs
-- (product_media.storage_reference + product_color_images.image_url)
-- BEFORE the delete cascades those rows away, and returns them as
-- `mediaUrls` — the caller (lib/admin/productMediaStorage.ts) is
-- responsible for filtering these down to genuinely-owned Storage paths
-- and queuing them with the existing storage_cleanup_jobs mechanism
-- (lib/account/storageCleanup.ts). This RPC never touches Storage itself
-- — only Postgres rows — keeping it a plain, fast, transactional delete.
create or replace function public.delete_draft_product(
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
  v_media_urls text[];
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'This product no longer exists.');
  end if;
  if p_brand_id is not null and v_product.brand_id <> p_brand_id then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_OWNED', 'message', 'You do not have access to this product.');
  end if;

  perform id from public.product_variants where product_id = p_product_id for update;

  v_eligibility := private.compute_product_deletion_eligibility(p_product_id);
  if coalesce((v_eligibility->>'canDeleteImmediately')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false, 'code', 'PRODUCT_NOT_DRAFT',
      'message', 'This product is not a pristine draft and cannot be deleted immediately.',
      'blockers', v_eligibility->'blockers'
    );
  end if;

  select array_agg(url) into v_media_urls from (
    select storage_reference as url from public.product_media where product_id = p_product_id
    union all
    select image_url as url from public.product_color_images where product_id = p_product_id
  ) urls;

  -- Safe disposable references cascade automatically (product_options,
  -- product_color_images, product_media DB rows, product_variants and
  -- their product_variant_values, back_in_stock_subscriptions) via their
  -- existing `on delete cascade` FKs — nothing else references a genuinely
  -- pristine draft, which is exactly what canDeleteImmediately verified.
  delete from public.products where id = p_product_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'DELETION_ELIGIBILITY_CHANGED', 'message', 'This product could not be deleted — it may have changed since eligibility was checked.');
  end if;

  return jsonb_build_object(
    'ok', true, 'code', 'DRAFT_DELETED', 'message', 'Draft permanently deleted.', 'lifecycle', 'deleted',
    'before', to_jsonb(v_product), 'mediaUrls', to_jsonb(coalesce(v_media_urls, array[]::text[]))
  );
end;
$$;

revoke all on function public.delete_draft_product(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.delete_draft_product(text, uuid, uuid, text) to service_role;

-- CORRECTIVE PASS (item 7): idempotency is now real, not just "the first
-- caller wins." A replay with the same (product_id, operation_key) is
-- only treated as a safe no-op if the actor and reason also match the
-- original — otherwise a different request is silently colliding with an
-- old key and must be rejected as IDEMPOTENCY_CONFLICT rather than
-- returning someone else's stored request.
--
-- CORRECTIVE PASS (item 1 / item 4): a request is now refused outright
-- (no row created) when the product has any IMMUTABLE-history blocker —
-- offering a deletion request that can never succeed was the exact
-- behavior item 4 prohibits. Only OPERATIONAL blockers (resolvable) allow
-- the request through as 'blocked'.
create or replace function public.request_product_deletion(
  p_product_id text,
  p_brand_id uuid,
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
  v_eligibility jsonb;
  v_existing record;
  v_new record;
  v_normalized_reason text;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'This product no longer exists.');
  end if;
  if p_brand_id is not null and v_product.brand_id <> p_brand_id then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_OWNED', 'message', 'You do not have access to this product.');
  end if;

  perform id from public.product_variants where product_id = p_product_id for update;

  v_normalized_reason := coalesce(nullif(trim(p_reason), ''), 'No reason provided.');

  if p_operation_key is not null then
    select * into v_existing from public.product_deletion_requests
    where product_id = p_product_id and operation_key = p_operation_key;
    if found then
      if v_existing.requested_by is distinct from p_actor_id or v_existing.reason <> v_normalized_reason then
        return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT', 'message', 'This idempotency key was already used for a different request.');
      end if;
      return jsonb_build_object('ok', true, 'code', 'DELETION_REQUESTED', 'message', 'Deletion request already recorded.', 'requestId', v_existing.id, 'requestState', v_existing.status);
    end if;
  end if;

  select * into v_existing from public.product_deletion_requests
  where product_id = p_product_id and status in ('requested', 'under_review', 'blocked') for update;
  if found then
    return jsonb_build_object('ok', false, 'code', 'DELETION_REQUEST_ALREADY_OPEN', 'message', 'A deletion request is already open for this product.', 'requestId', v_existing.id, 'requestState', v_existing.status);
  end if;

  if v_product.status <> 'archived' then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_DRAFT', 'message', 'Archive this product before requesting permanent deletion.');
  end if;

  v_eligibility := private.compute_product_deletion_eligibility(p_product_id);

  if coalesce((v_eligibility->>'mustRetainHistory')::boolean, false) is true then
    return jsonb_build_object(
      'ok', false, 'code', 'PRODUCT_MUST_BE_RETAINED',
      'message', 'This product has order, review, inventory, warehouse, or return history and must remain archived permanently — it can never be permanently deleted, so no deletion request was created.',
      'blockers', v_eligibility->'blockers'
    );
  end if;

  insert into public.product_deletion_requests (
    product_id, product_name, product_sku, product_image, brand_id,
    requested_by, requested_by_label, reason, status, blocker_snapshot, operation_key
  ) values (
    p_product_id, v_product.name, v_product.sku, v_product.image, v_product.brand_id,
    p_actor_id, p_actor_label, v_normalized_reason,
    case when jsonb_array_length(v_eligibility->'blockers') > 0 then 'blocked' else 'requested' end,
    v_eligibility->'blockers', p_operation_key
  )
  returning * into v_new;

  return jsonb_build_object(
    'ok', true, 'code', 'DELETION_REQUESTED', 'message', 'Deletion request submitted.',
    'requestId', v_new.id, 'requestState', v_new.status, 'blockers', v_new.blocker_snapshot
  );
end;
$$;

revoke all on function public.request_product_deletion(text, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.request_product_deletion(text, uuid, uuid, text, text, text) to service_role;

create or replace function public.cancel_product_deletion_request(
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
  v_request record;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'This product no longer exists.');
  end if;
  if p_brand_id is not null and v_product.brand_id <> p_brand_id then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_OWNED', 'message', 'You do not have access to this product.');
  end if;

  select * into v_request from public.product_deletion_requests
  where product_id = p_product_id and status in ('requested', 'under_review', 'blocked') for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'DELETION_REQUEST_NOT_FOUND', 'message', 'There is no open deletion request for this product.');
  end if;

  update public.product_deletion_requests
    set status = 'cancelled', cancelled_at = now(), updated_at = now()
    where id = v_request.id;

  return jsonb_build_object('ok', true, 'code', 'DELETION_REQUEST_CANCELLED', 'message', 'Deletion request cancelled.', 'requestId', v_request.id, 'requestState', 'cancelled');
end;
$$;

revoke all on function public.cancel_product_deletion_request(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_product_deletion_request(text, uuid, uuid, text) to service_role;

-- Admin: move a request to under_review / blocked / rejected. Approval
-- (the only status that actually deletes) is its own function below.
--
-- CORRECTIVE PASS: recompute now passes p_ignore_request_id = p_request_id
-- so marking a request 'blocked' doesn't spuriously add
-- DELETION_REQUEST_ALREADY_OPEN against itself.
create or replace function public.admin_update_deletion_request(
  p_request_id uuid,
  p_actor_id uuid,
  p_actor_label text,
  p_new_status text,
  p_admin_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id text;
  v_request record;
  v_eligibility jsonb;
begin
  if p_new_status not in ('under_review', 'blocked', 'rejected') then
    return jsonb_build_object('ok', false, 'code', 'DELETION_REQUEST_STATE_CONFLICT', 'message', 'Invalid status transition.');
  end if;

  -- Un-locked lookup only to learn which product this request belongs to,
  -- so locks can then be acquired in the same global order every lifecycle
  -- RPC uses (products -> product_variants -> product_deletion_requests),
  -- avoiding a deadlock cycle against request_product_deletion/
  -- cancel_product_deletion_request (which only know the product id up
  -- front, never the request id).
  select product_id into v_product_id from public.product_deletion_requests where id = p_request_id;
  if v_product_id is null then
    return jsonb_build_object('ok', false, 'code', 'DELETION_REQUEST_NOT_FOUND', 'message', 'Deletion request not found.');
  end if;

  perform id from public.products where id = v_product_id for update;
  perform id from public.product_variants where product_id = v_product_id for update;

  select * into v_request from public.product_deletion_requests where id = p_request_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'DELETION_REQUEST_NOT_FOUND', 'message', 'Deletion request not found.');
  end if;
  if v_request.status not in ('requested', 'under_review', 'blocked') then
    return jsonb_build_object('ok', false, 'code', 'DELETION_REQUEST_STATE_CONFLICT', 'message', 'This request has already been resolved.');
  end if;

  if p_new_status = 'rejected' and coalesce(nullif(trim(p_admin_note), ''), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'DELETION_REQUEST_STATE_CONFLICT', 'message', 'A reason is required to reject a deletion request.');
  end if;

  if p_new_status = 'blocked' then
    v_eligibility := private.compute_product_deletion_eligibility(v_product_id, p_request_id);
  end if;

  update public.product_deletion_requests
    set status = p_new_status,
        reviewed_by = p_actor_id,
        reviewed_at = now(),
        admin_note = coalesce(nullif(trim(p_admin_note), ''), admin_note),
        blocker_snapshot = coalesce(v_eligibility->'blockers', blocker_snapshot),
        updated_at = now()
    where id = p_request_id;

  return jsonb_build_object('ok', true, 'code', 'DELETION_REQUEST_UPDATED', 'message', 'Deletion request updated.', 'requestId', p_request_id, 'requestState', p_new_status);
end;
$$;

revoke all on function public.admin_update_deletion_request(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_deletion_request(uuid, uuid, text, text, text) to service_role;

-- CORRECTIVE PASS (items 1, 2, 3, 8): this is the function the original
-- migration made structurally impossible to succeed. Fixed by:
--   - recomputing eligibility with p_ignore_request_id = p_request_id, so
--     this request's own open-request state is never counted against it;
--   - the immutable-vs-operational split above means an archived,
--     previously-published, history-free product no longer trips
--     PRODUCT_NOT_DRAFT;
--   - product_id is now nullable/ON DELETE SET NULL with a name/sku/image
--     snapshot, so the delete below can actually succeed and the request
--     row survives it, readable forever;
--   - the whole function is one Postgres statement-level transaction — an
--     unhandled exception at any point (including from the DELETE itself,
--     e.g. an unanticipated FK restrict) aborts everything mutated so far
--     automatically; nothing here needs a manual rollback;
--   - media URLs are captured before the delete for durable Storage
--     cleanup, exactly like delete_draft_product.
create or replace function public.admin_approve_product_deletion(
  p_request_id uuid,
  p_actor_id uuid,
  p_actor_label text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id text;
  v_request record;
  v_product record;
  v_eligibility jsonb;
  v_media_urls text[];
begin
  -- Same un-locked-lookup-then-locks-in-global-order pattern as
  -- admin_update_deletion_request above — see its comment.
  select product_id into v_product_id from public.product_deletion_requests where id = p_request_id;
  if v_product_id is null then
    return jsonb_build_object('ok', false, 'code', 'DELETION_REQUEST_NOT_FOUND', 'message', 'Deletion request not found.');
  end if;

  select * into v_product from public.products where id = v_product_id for update;
  perform id from public.product_variants where product_id = v_product_id for update;

  select * into v_request from public.product_deletion_requests where id = p_request_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'DELETION_REQUEST_NOT_FOUND', 'message', 'Deletion request not found.');
  end if;
  if v_request.status not in ('requested', 'under_review', 'blocked') then
    return jsonb_build_object('ok', false, 'code', 'DELETION_REQUEST_STATE_CONFLICT', 'message', 'This request has already been resolved.');
  end if;

  if v_product.id is null then
    -- Product already gone somehow — resolve the orphaned request rather
    -- than leaving it stuck open forever. product_id is already null via
    -- the ON DELETE SET NULL FK action; nothing further to snapshot here
    -- since request creation already captured a name/sku/image snapshot.
    update public.product_deletion_requests set status = 'completed', completed_at = now(), reviewed_by = p_actor_id, reviewed_at = now(), updated_at = now() where id = p_request_id;
    return jsonb_build_object('ok', true, 'code', 'PRODUCT_PERMANENTLY_DELETED', 'message', 'Product was already gone; request closed.', 'requestId', p_request_id, 'requestState', 'completed');
  end if;

  -- Always recompute — never trust the snapshot taken at request time —
  -- and never let this request's own "open request" state count against
  -- itself.
  v_eligibility := private.compute_product_deletion_eligibility(v_product_id, p_request_id);
  if coalesce((v_eligibility->>'mustRetainHistory')::boolean, true) is true
     or jsonb_array_length(v_eligibility->'blockers') > 0 then
    update public.product_deletion_requests
      set status = 'blocked', blocker_snapshot = v_eligibility->'blockers', updated_at = now()
      where id = p_request_id;
    return jsonb_build_object(
      'ok', false, 'code', 'PRODUCT_MUST_BE_RETAINED',
      'message', 'New activity means this product can no longer be safely deleted — it remains archived.',
      'requestId', p_request_id, 'requestState', 'blocked', 'blockers', v_eligibility->'blockers'
    );
  end if;

  select array_agg(url) into v_media_urls from (
    select storage_reference as url from public.product_media where product_id = v_product_id
    union all
    select image_url as url from public.product_color_images where product_id = v_product_id
  ) urls;

  delete from public.products where id = v_product_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'DELETION_ELIGIBILITY_CHANGED', 'message', 'This product could not be deleted — it may have changed since eligibility was checked.');
  end if;

  update public.product_deletion_requests
    set status = 'completed', completed_at = now(), reviewed_by = p_actor_id, reviewed_at = now(), updated_at = now(),
        product_name = v_product.name, product_sku = v_product.sku, product_image = v_product.image
    where id = p_request_id;

  return jsonb_build_object(
    'ok', true, 'code', 'PRODUCT_PERMANENTLY_DELETED', 'message', 'Product permanently deleted.',
    'requestId', p_request_id, 'requestState', 'completed', 'before', to_jsonb(v_product),
    'mediaUrls', to_jsonb(coalesce(v_media_urls, array[]::text[]))
  );
end;
$$;

revoke all on function public.admin_approve_product_deletion(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_approve_product_deletion(uuid, uuid, text) to service_role;

-- Admin emergency control: hide/archive immediately regardless of any open
-- deletion-request state. Never deletes anything, never bypasses the
-- deletion RPCs above — just forces status = 'archived' with a mandatory
-- reason, for cases needing instant storefront removal.
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
begin
  if coalesce(nullif(trim(p_reason), ''), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'DELETION_REQUEST_STATE_CONFLICT', 'message', 'A reason is required to hide a product.');
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'This product no longer exists.');
  end if;
  perform id from public.product_variants where product_id = p_product_id for update;

  if v_product.status = 'archived' then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_ARCHIVED', 'message', 'Already hidden.', 'lifecycle', 'archived');
  end if;

  update public.products set status = 'archived' where id = p_product_id;

  return jsonb_build_object('ok', true, 'code', 'EMERGENCY_HIDDEN', 'message', 'Product hidden from the storefront.', 'lifecycle', 'archived', 'before', to_jsonb(v_product));
end;
$$;

revoke all on function public.admin_emergency_hide_product(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_emergency_hide_product(text, uuid, text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 5. Checkout defense-in-depth: an archived/draft/unpublished product can
--    never gain a new order_items row, even via a direct RPC call that
--    skips the app-layer cart/checkout availability checks. All existing
--    order-placement RPCs (place_order, place_paid_order) already check
--    product_variants.selling_status/quantity but never products.status —
--    this closes that gap for every current and future insert path at
--    once, rather than patching each RPC body individually.
--
-- CORRECTIVE PASS (item 9): the original version silently skipped the
-- check whenever NEW.product_id was null, even though every real
-- order-placement path also sets variant_id — a caller that only supplied
-- variant_id (product_id null) sailed straight through with zero
-- enforcement. Now resolves the product via variant_id whenever
-- product_id is null, and only skips entirely when *neither* is present
-- (a genuinely product-less historical row, which no live insert path
-- produces).
-- ----------------------------------------------------------------------------

create or replace function private.enforce_order_item_product_available()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_product_id text;
begin
  v_product_id := new.product_id;
  if v_product_id is null and new.variant_id is not null then
    select product_id into v_product_id from public.product_variants where id = new.variant_id;
  end if;
  if v_product_id is null then
    return new;
  end if;
  select status into v_status from public.products where id = v_product_id;
  if v_status is distinct from 'published' then
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
-- 6. storefront_products: filter archived/paused/inactive-brand products
--    for every reader, not only RLS-scoped anon/authenticated queries.
--    Service-role reads (lib/cart/liveValidation.ts, lib/payments/
--    intentionCart.ts, checkout RPCs) bypass RLS entirely, so the view
--    itself must carry this predicate — it previously relied on the RLS
--    policy alone, exactly the class of bug 20260814000006 was written to
--    fix for the launch gate, now extended to the base publish/pause/
--    active-brand conditions too.
-- ----------------------------------------------------------------------------

create or replace view public.storefront_products
with (security_invoker = true)
as
select
  p.id, p.name, p.brand_name, p.brand_slug, p.brand_id, p.product_type_id, p.audience, p.collection_id,
  p.material, p.materials, p.fit, p.price, p.discount_percent, p.discount_ends_at,
  p.currency, p.image, p.images, p.rating, p.review_count, p.description, p.details,
  p.care_instructions, p.shipping_returns, p.model_height, p.model_wearing, p.sku,
  p.is_new, p.featured, p.status, p.publish_date, p.paused_by_brand,
  p.default_low_stock_threshold, p.created_at, p.first_stocked_at
from public.products p
where p.status = 'published'
  and coalesce(p.paused_by_brand, false) = false
  and (p.publish_date is null or p.publish_date <= now())
  and exists (
    select 1 from public.brands b
    where b.id = p.brand_id and b.is_active = true
  )
  and private.is_product_storefront_launch_gated(p.brand_id, p.first_stocked_at);

grant select on public.storefront_products to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. Admin review queue: a single paginated, filtered, database-level
--    search RPC (item 10). Replaces the original app-layer approach of
--    loading every product_deletion_requests row and filtering/paginating
--    in JavaScript — status/brand/partner/text-search and LIMIT/OFFSET are
--    all applied inside this one query, so the admin review queue never
--    pulls more rows out of Postgres than the current page actually needs.
-- ----------------------------------------------------------------------------

create or replace function private.admin_search_deletion_requests(
  p_status text default null,
  p_brand_id uuid default null,
  p_is_partner boolean default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_total integer;
  v_rows jsonb;
begin
  select count(*) into v_total
  from public.product_deletion_requests r
  join public.brands b on b.id = r.brand_id
  where (p_status is null or r.status = p_status)
    and (p_brand_id is null or r.brand_id = p_brand_id)
    and (p_is_partner is null or b.is_mahaly_partner = p_is_partner)
    and (
      v_search is null
      or r.id::text ilike '%' || v_search || '%'
      or r.product_id ilike '%' || v_search || '%'
      or r.product_name ilike '%' || v_search || '%'
      or b.name ilike '%' || v_search || '%'
    );

  select coalesce(jsonb_agg(row_data order by requested_at desc), '[]'::jsonb) into v_rows
  from (
    select
      jsonb_build_object(
        'id', r.id, 'productId', r.product_id, 'brandId', r.brand_id,
        'productName', r.product_name, 'productSku', r.product_sku, 'productImage', r.product_image,
        'requestedByLabel', r.requested_by_label, 'requestedAt', r.requested_at, 'reason', r.reason,
        'status', r.status, 'reviewedAt', r.reviewed_at, 'adminNote', r.admin_note,
        'completedAt', r.completed_at, 'cancelledAt', r.cancelled_at, 'blockerSnapshot', r.blocker_snapshot,
        'brandName', b.name, 'brandSlug', b.slug, 'brandIsPartner', b.is_mahaly_partner
      ) as row_data,
      r.requested_at
    from public.product_deletion_requests r
    join public.brands b on b.id = r.brand_id
    where (p_status is null or r.status = p_status)
      and (p_brand_id is null or r.brand_id = p_brand_id)
      and (p_is_partner is null or b.is_mahaly_partner = p_is_partner)
      and (
        v_search is null
        or r.id::text ilike '%' || v_search || '%'
        or r.product_id ilike '%' || v_search || '%'
        or r.product_name ilike '%' || v_search || '%'
        or b.name ilike '%' || v_search || '%'
      )
    order by r.requested_at desc
    limit v_limit offset v_offset
  ) page;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'limit', v_limit, 'offset', v_offset);
end;
$$;

revoke all on function private.admin_search_deletion_requests(text, uuid, boolean, text, integer, integer) from public, anon, authenticated;

create or replace function public.admin_search_deletion_requests(
  p_status text default null,
  p_brand_id uuid default null,
  p_is_partner boolean default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.admin_search_deletion_requests(p_status, p_brand_id, p_is_partner, p_search, p_limit, p_offset);
$$;

revoke all on function public.admin_search_deletion_requests(text, uuid, boolean, text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_search_deletion_requests(text, uuid, boolean, text, integer, integer) to service_role;
