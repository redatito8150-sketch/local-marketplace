-- ============================================================================
-- Product lifecycle: Draft / Published / Paused / Retired / Scheduled-for-
-- deletion / Deleted.
--
-- THIRD PASS — supersedes the admin-approval deletion-request model this
-- migration used to implement. That model (product_deletion_requests,
-- requested -> under_review/blocked -> approved/rejected/cancelled ->
-- completed, with an admin having to click "Approve") is gone entirely.
-- Ordinary deletion no longer waits on a human: eligibility is objective
-- and database-authoritative, so a brand owner scheduling deletion of a
-- history-free Retired product gets an automatic 7-day grace period and
-- then automatic execution, not a queue for staff to review. There is
-- nothing here for an admin to "approve" — only to cancel (if they want
-- to stop it) or hold (to legally freeze a product first).
--
-- Internal representation: `products.status` keeps exactly the same three
-- values it always has (`draft`, `published`, `archived`) — no new status
-- value was technically necessary. `archived` is what this migration (and
-- the rest of the codebase) has always called it internally; it is
-- presented to users as "Retired" everywhere in the UI/API response
-- shapes, per this pass's own instruction to keep the DB representation
-- and only change the presentation layer. "Paused" is also not a new
-- status — it's the pre-existing `products.paused_by_brand` boolean while
-- status stays 'published' (already wired up before this migration ever
-- existed); nothing here changes that mechanism, since pausing never
-- touches `status` and is therefore untouched by the archived-transition
-- trigger below.
--
-- This file replaces `product_deletion_requests` with two new tables:
--   - `product_deletion_schedules` — an automatic 7-day grace-period
--     schedule (scheduled -> cancelled / blocked / completed), not a
--     request awaiting review. `product_id` nullable / ON DELETE SET NULL
--     with an immutable name/sku/image snapshot, so a *completed*
--     schedule's history record survives the product it refers to
--     actually being hard-deleted.
--   - `product_deletion_holds` — a real legal/admin hold (active/
--     released), which blocks immediate deletion, scheduling, and
--     execution of an existing schedule while active.
--
-- Retained unchanged from the prior two passes (still correct, still
-- needed): the canonical eligibility calculation's immutable/operational/
-- pristine-draft-only blocker split, the `products_enforce_archived_
-- transition` trigger (the database-level boundary against the
-- archived -> draft -> published bypass — restore_product is still the
-- only path out of 'archived'), the DB-association-based media-ownership
-- capture + transactional storage_cleanup_jobs enqueue, the order_items
-- availability guard (resolves via variant_id when product_id is null),
-- and the storefront_products view's own publish/pause/active-brand
-- predicate (not just RLS).
-- ============================================================================

create extension if not exists pg_trgm;

-- Products has no timestamp recording when it entered 'archived' — needed
-- for a real Retired tab (sort by most-recently-retired, not by
-- created_at, which is when the product was first made). Nullable,
-- cleared on restore, set on retire/emergency-hide.
alter table public.products add column if not exists retired_at timestamptz;

-- ----------------------------------------------------------------------------
-- 1. product_deletion_holds — a real legal/admin hold, independent of any
--    deletion schedule. An active hold blocks immediate hard deletion,
--    scheduling, and execution of an existing schedule (checked inside the
--    eligibility calculation and, redundantly, inside every RPC that
--    actually deletes/schedules, so a hold applied mid-transaction can
--    never be missed by a stale earlier read).
-- ----------------------------------------------------------------------------

create table if not exists public.product_deletion_holds (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'released')),
  reason text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_by_label text not null,
  created_at timestamptz not null default now(),
  released_by uuid references auth.users(id) on delete set null,
  released_by_label text,
  released_at timestamptz
);

-- At most one active hold per product — release the existing one before a
-- new one can be applied, rather than silently stacking holds.
create unique index if not exists product_deletion_holds_one_active_per_product_idx
  on public.product_deletion_holds (product_id)
  where status = 'active';
create index if not exists product_deletion_holds_product_status_idx
  on public.product_deletion_holds (product_id, status);

alter table public.product_deletion_holds enable row level security;
revoke all on public.product_deletion_holds from public, anon, authenticated;
grant select, insert, update, delete on public.product_deletion_holds to service_role;

-- ----------------------------------------------------------------------------
-- 2. product_deletion_schedules — the automatic 7-day grace-period
--    schedule. Replaces product_deletion_requests entirely (that table
--    was never applied to any real database, so this is a redesign in
--    place, not an additive/compat change).
-- ----------------------------------------------------------------------------

create table if not exists public.product_deletion_schedules (
  id uuid primary key default gen_random_uuid(),
  -- Nullable + ON DELETE SET NULL: a *completed* schedule must outlive the
  -- product it refers to once that product is actually, permanently
  -- deleted. The snapshot columns below keep the record meaningful once
  -- product_id goes null.
  product_id text references public.products(id) on delete set null,
  product_name text not null default '',
  product_sku text,
  product_image text,
  brand_id uuid not null references public.brands(id) on delete restrict,
  initiated_by uuid references auth.users(id) on delete set null,
  initiated_by_label text not null,
  reason text,
  status text not null default 'scheduled' check (status in (
    'scheduled', 'cancelled', 'blocked', 'completed'
  )),
  scheduled_at timestamptz not null default now(),
  due_at timestamptz not null,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_by_label text,
  blocked_at timestamptz,
  blocked_reason text,
  completed_at timestamptz,
  -- Blocker snapshot from the moment the schedule was last evaluated
  -- (creation, or the blocking evaluation at execution time) — for
  -- display; the RPCs below always recompute fresh rather than trusting
  -- this snapshot for any actual decision.
  blocker_snapshot jsonb not null default '[]'::jsonb,
  -- Idempotency: a replayed identical schedule call (same product, same
  -- actor, same key, same reason) returns the existing schedule instead of
  -- creating a duplicate. A replay with the same key but a different
  -- actor/reason is a real conflict — see schedule_product_deletion.
  operation_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one active ('scheduled') schedule per product. Once a schedule
-- resolves (cancelled/blocked/completed) it's terminal — trying again
-- means calling schedule_product_deletion again, which creates a new row.
create unique index if not exists product_deletion_schedules_one_active_per_product_idx
  on public.product_deletion_schedules (product_id)
  where status = 'scheduled';

create index if not exists product_deletion_schedules_brand_status_idx
  on public.product_deletion_schedules (brand_id, status, due_at);
-- The cron executor's own working set: every row it ever queries is
-- status = 'scheduled', ordered by due_at — a partial index scoped to
-- exactly that predicate keeps the due-date scan cheap regardless of how
-- much cancelled/blocked/completed history accumulates over time.
create index if not exists product_deletion_schedules_due_idx
  on public.product_deletion_schedules (due_at)
  where status = 'scheduled';
create unique index if not exists product_deletion_schedules_operation_key_idx
  on public.product_deletion_schedules (product_id, operation_key)
  where operation_key is not null;
create index if not exists product_deletion_schedules_product_name_trgm_idx
  on public.product_deletion_schedules using gin (product_name gin_trgm_ops);

alter table public.product_deletion_schedules enable row level security;
-- No RLS policy is added on purpose, matching this codebase's established
-- convention for `products`/`brands`/`orders` writes: every read and write
-- path goes through server-side code using the service_role key, never
-- the browser anon key. RLS-enabled-with-no-policy means "deny by
-- default" for anon/authenticated.
revoke all on public.product_deletion_schedules from public, anon, authenticated;
grant select, insert, update, delete on public.product_deletion_schedules to service_role;

-- ----------------------------------------------------------------------------
-- 3. deletion_requested_at compatibility mirror (display-only, never
--    authoritative) — now mirrors "there is an active deletion schedule"
--    instead of "there is an open deletion request." Nothing new reads
--    this column for any real decision; every RPC below reads/writes
--    product_deletion_schedules directly.
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
        select scheduled_at from public.product_deletion_schedules
        where product_id = old.product_id and status = 'scheduled'
        order by scheduled_at desc limit 1
      )
      where id = old.product_id;
    return old;
  end if;

  if new.product_id is null then
    return new;
  end if;
  update public.products
    set deletion_requested_at = case when new.status = 'scheduled' then new.scheduled_at else null end
    where id = new.product_id;
  return new;
end;
$$;

drop trigger if exists product_deletion_requests_sync_mirror on public.product_deletion_schedules;
drop trigger if exists product_deletion_schedules_sync_mirror on public.product_deletion_schedules;
create trigger product_deletion_schedules_sync_mirror
after insert or update of status or delete on public.product_deletion_schedules
for each row execute function private.sync_product_deletion_requested_at();

revoke all on function private.sync_product_deletion_requested_at() from public, anon, authenticated;

comment on column public.products.deletion_requested_at is
  'Display-only mirror of the current active (scheduled) product_deletion_schedules row for this product, if any, kept in sync by trigger. Never authoritative — read product_deletion_schedules for real workflow state.';

-- ----------------------------------------------------------------------------
-- 4. Canonical eligibility calculation.
--
-- Blockers are split into three disjoint groups so they can never leak
-- into the wrong decision:
--   - IMMUTABLE (reviews / order history / inventory history / warehouse
--     history / return history): sets mustRetainHistory = true. Permanently
--     forbids hard deletion — schedule_product_deletion refuses to even
--     create a schedule when any of these are present, and no impossible
--     request/approval is ever generated.
--   - OPERATIONAL (open orders / available or reserved or incoming stock /
--     open warehouse document / quarantine / open return / open
--     fulfillment transition / an active legal-admin hold / an already-
--     active deletion schedule other than the one being evaluated):
--     resolvable over time. Blocks canDeleteImmediately/canScheduleDeletion
--     for now, but never sets mustRetainHistory.
--   - PRISTINE-DRAFT-ONLY (PRODUCT_NOT_DRAFT / PRODUCT_EVER_PUBLISHED):
--     never added to the shared blockers array — a Retired, previously-
--     published, history-free product must never see these; they only
--     feed canDeleteImmediately's own boolean (the pristine-draft path is
--     a completely separate rule set from the Retired-product scheduling
--     path).
-- `p_ignore_schedule_id`: when recomputing eligibility on behalf of a
-- specific schedule (its own creation-time check, or the cron executor
-- evaluating it at due time), that schedule's own active-schedule state
-- must never count against itself.
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
  p_ignore_schedule_id uuid default null
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
  v_has_hold boolean := false;
  v_open_schedule_id uuid;
  v_open_schedule_excluding_self boolean;
  v_cnt integer;
  v_qty numeric;
  v_lifecycle text;
  v_can_retire boolean;
  v_can_restore boolean;
  v_can_delete_now boolean;
  v_can_schedule boolean;
begin
  select * into v_product from public.products where id = p_product_id;
  if not found then
    return jsonb_build_object(
      'productId', p_product_id,
      'lifecycle', 'draft',
      'canRetire', false,
      'canRestore', false,
      'canDeleteImmediately', false,
      'canScheduleDeletion', false,
      'mustRetainHistory', false,
      'hasActiveHold', false,
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

  select exists(
    select 1 from public.product_deletion_holds where product_id = p_product_id and status = 'active'
  ) into v_has_hold;
  if v_has_hold then
    v_pristine := false;
    v_blockers := private.append_deletion_blocker(v_blockers, 'PRODUCT_HAS_ACTIVE_HOLD', 'permissions', 'This product has an active legal/admin hold — deletion is not available until the hold is released.', null, null);
  end if;

  -- ===== PRISTINE-DRAFT-ONLY (never added to the shared blockers array) =====
  if v_product.status <> 'draft' or v_product.publish_date is not null or v_product.first_stocked_at is not null then
    v_pristine := false;
  end if;

  -- ===== Active deletion schedule (excluding the schedule currently being
  -- evaluated, if any) =====
  select id into v_open_schedule_id from public.product_deletion_schedules
  where product_id = p_product_id and status = 'scheduled'
  limit 1;
  v_open_schedule_excluding_self := v_open_schedule_id is not null
    and (p_ignore_schedule_id is null or v_open_schedule_id <> p_ignore_schedule_id);
  if v_open_schedule_excluding_self then
    v_blockers := private.append_deletion_blocker(v_blockers, 'DELETION_ALREADY_SCHEDULED', 'other', 'A deletion is already scheduled for this product.', null, null);
  end if;

  v_lifecycle := case
    when v_must_retain then 'historical'
    when v_product.status = 'archived' then 'archived'
    when v_product.status = 'published' then 'active'
    else 'draft'
  end;

  v_can_retire := v_product.status <> 'archived';
  v_can_restore := v_product.status = 'archived' and v_open_schedule_id is null;
  v_can_delete_now := v_pristine and v_product.status = 'draft' and v_open_schedule_id is null and not v_has_hold;
  -- Deliberately excludes only the ignored schedule's own self-reference,
  -- not "any active schedule" — when recomputing on behalf of the very
  -- schedule being created/executed (p_ignore_schedule_id set), that
  -- schedule's own still-active row must not make canScheduleDeletion
  -- look false for reasons unrelated to what's actually being decided.
  -- Simplified to "no blockers of any kind and no immutable history" —
  -- every operational condition (stock, warehouse state, hold, another
  -- active schedule) is already represented in v_blockers by this point.
  v_can_schedule := v_product.status = 'archived' and not v_must_retain and jsonb_array_length(v_blockers) = 0;

  return jsonb_build_object(
    'productId', p_product_id,
    'lifecycle', v_lifecycle,
    'canRetire', v_can_retire,
    'canRestore', v_can_restore,
    'canDeleteImmediately', v_can_delete_now,
    'canScheduleDeletion', v_can_schedule,
    'mustRetainHistory', v_must_retain,
    'hasActiveHold', v_has_hold,
    'blockers', v_blockers
  );
end;
$$;

revoke all on function private.compute_product_deletion_eligibility(text, uuid) from public, anon, authenticated;

create or replace function public.get_product_deletion_eligibility(p_product_id text, p_ignore_schedule_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.compute_product_deletion_eligibility(p_product_id, p_ignore_schedule_id);
$$;

revoke all on function public.get_product_deletion_eligibility(text, uuid) from public, anon, authenticated;
grant execute on function public.get_product_deletion_eligibility(text, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 5. Lifecycle RPCs
--
-- Every RPC below: locks the product row `for update` first (then variant
-- rows `for update`, same order every time), recomputes eligibility inside
-- the same transaction, never trusts a stale client-supplied eligibility
-- snapshot, and returns a stable jsonb envelope `{ok, code, message, ...}`.
-- `p_brand_id` non-null means "verify this product belongs to this brand"
-- (brand-portal callers); null means the caller has already been
-- authorized as admin at the application layer.
-- ----------------------------------------------------------------------------

create or replace function public.retire_product(
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
    -- Idempotent: retiring an already-Retired product is a safe no-op.
    return jsonb_build_object('ok', true, 'code', 'ALREADY_RETIRED', 'message', 'Already retired.', 'lifecycle', 'archived');
  end if;

  update public.products set status = 'archived', retired_at = now() where id = p_product_id;

  return jsonb_build_object('ok', true, 'code', 'RETIRED', 'message', 'Product retired.', 'lifecycle', 'archived', 'before', to_jsonb(v_product));
end;
$$;

revoke all on function public.retire_product(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.retire_product(text, uuid, uuid, text) to service_role;

-- Restore always targets 'draft', never 'published' directly — getting
-- back to Published is deliberately left to the ordinary edit-and-publish
-- flow (full form save, validateProductInput), which already does full
-- validation; there is no second, parallel publish-readiness
-- implementation here to keep in sync with the real one.
--
-- `perform set_config('app.product_restore_in_progress', 'on', true)`
-- (local to this transaction, auto-clears at commit/rollback) is the only
-- way the products_enforce_archived_transition trigger below ever allows
-- an archived row to leave 'archived' — see that trigger's own comment.
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
  v_open_schedule record;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'This product no longer exists.');
  end if;
  if p_brand_id is not null and v_product.brand_id <> p_brand_id then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_OWNED', 'message', 'You do not have access to this product.');
  end if;
  if v_product.status <> 'archived' then
    return jsonb_build_object('ok', false, 'code', 'RETIRE_STATE_CONFLICT', 'message', 'Only a retired product can be restored.');
  end if;

  perform id from public.product_variants where product_id = p_product_id for update;

  select * into v_open_schedule from public.product_deletion_schedules
  where product_id = p_product_id and status = 'scheduled' for update;
  if found then
    return jsonb_build_object('ok', false, 'code', 'DELETION_SCHEDULE_ALREADY_ACTIVE', 'message', 'Cancel the scheduled deletion before restoring this product.');
  end if;

  select * into v_brand from public.brands where id = v_product.brand_id;
  if not found or v_brand.is_active <> true then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHORIZED', 'message', 'This brand is not active, so its products cannot be restored.');
  end if;

  perform set_config('app.product_restore_in_progress', 'on', true);
  update public.products set status = 'draft', draft_started_at = now(), retired_at = null where id = p_product_id;

  return jsonb_build_object('ok', true, 'code', 'RESTORED', 'message', 'Product restored to Draft — publish it from the editor when ready.', 'lifecycle', 'draft', 'before', to_jsonb(v_product));
end;
$$;

revoke all on function public.restore_product(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.restore_product(text, uuid, uuid, text) to service_role;

-- The database-level boundary against the archived -> draft -> published
-- two-step bypass. An archived (Retired) product may leave 'archived'
-- ONLY inside restore_product (which sets this session-local flag
-- immediately before its own update) — any other UPDATE that tries to
-- move a row's status away from 'archived', from ANY caller (an admin
-- route, a bulk script, a one-off service-role query run by hand), is
-- rejected outright, independent of whatever the API-layer route guards
-- do or forget to do.
create or replace function private.enforce_archived_product_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'archived' and new.status <> 'archived'
     and coalesce(current_setting('app.product_restore_in_progress', true), '') <> 'on' then
    raise exception 'PRODUCT_ARCHIVED_TRANSITION_REQUIRES_RESTORE';
  end if;
  return new;
end;
$$;

drop trigger if exists products_enforce_archived_transition on public.products;
create trigger products_enforce_archived_transition
before update of status on public.products
for each row execute function private.enforce_archived_product_transition();

revoke all on function private.enforce_archived_product_transition() from public, anon, authenticated;

-- Media ownership is proven by DB association (any URL actually stored
-- against this product's own product_media/product_color_images/
-- products.image/products.images rows), not by guessing from the URL's
-- folder shape — real uploads commonly still live under the *temporary*
-- folder used before the product had a permanent id (products/{tempId}/
-- ... for admin, product-drafts/{userId}/{tempId}/... for brand-portal —
-- see components/admin/ProductForm.tsx's uploadFolderId), which a
-- path-prefix check would silently miss. The moment a URL is written
-- into one of those columns for this product_id, that row IS the
-- authoritative ownership record, regardless of folder shape. Safety
-- checks: (a) must be one of our own Storage bucket's public URLs
-- (matched by the Supabase Storage public-URL path shape itself, not a
-- hostname — never deletes an arbitrary external URL), and (b) no OTHER
-- live product's rows/legacy fields reference the exact same URL (never
-- deletes shared media).
create or replace function private.capture_owned_product_media_urls(
  p_product_id text, p_image text, p_images text[]
)
returns text[]
language sql
stable
set search_path = ''
as $$
  select array_agg(distinct candidate.url) from (
    select storage_reference as url from public.product_media where product_id = p_product_id
    union
    select image_url as url from public.product_color_images where product_id = p_product_id
    union
    select unnest(array_remove(array[p_image] || coalesce(p_images, array[]::text[]), null))
  ) candidate(url)
  where candidate.url like '%/storage/v1/object/public/product-images/%'
    and not exists (select 1 from public.product_media pm2 where pm2.storage_reference = candidate.url and pm2.product_id <> p_product_id)
    and not exists (select 1 from public.product_color_images pci2 where pci2.image_url = candidate.url and pci2.product_id <> p_product_id)
    and not exists (select 1 from public.products p2 where p2.id <> p_product_id and (p2.image = candidate.url or candidate.url = any(p2.images)));
$$;

revoke all on function private.capture_owned_product_media_urls(text, text, text[]) from public, anon, authenticated;

-- Enqueues cleanup jobs directly into storage_cleanup_jobs (lib/account/
-- storageCleanup.ts's own table) INSIDE the caller's transaction — not as
-- a separate step application code performs after the RPC returns. The
-- enqueue and the delete either both commit or both roll back together —
-- a failure inserting a job aborts the whole function, so the product
-- delete that follows never runs either.
create or replace function private.queue_owned_product_media_cleanup(
  p_product_id text, p_image text, p_images text[], p_actor_id uuid
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_urls text[];
  v_queued integer := 0;
begin
  v_urls := private.capture_owned_product_media_urls(p_product_id, p_image, p_images);
  if v_urls is null then
    return 0;
  end if;

  insert into public.storage_cleanup_jobs (bucket_id, storage_path, owner_user_id)
  select 'product-images', regexp_replace(url, '^.*?/storage/v1/object/public/product-images/', ''), p_actor_id
  from unnest(v_urls) as url
  -- Idempotent: re-running for the same product/URLs (a retry after an
  -- earlier partial failure, or a defensive double-call) never duplicates
  -- a job — the table's own unique(bucket_id, storage_path) absorbs it.
  on conflict (bucket_id, storage_path) do nothing;
  get diagnostics v_queued = row_count;
  return v_queued;
end;
$$;

revoke all on function private.queue_owned_product_media_cleanup(text, text, text[], uuid) from public, anon, authenticated;

-- A genuinely pristine draft (never published/stocked/ordered/reviewed/
-- warehoused/returned) may be deleted immediately, without any grace
-- period — its eligibility is a completely separate rule set from a
-- Retired product's.
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
  v_queued integer;
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

  v_media_urls := private.capture_owned_product_media_urls(p_product_id, v_product.image, v_product.images);
  -- Enqueued BEFORE the delete, in the same transaction: if this insert
  -- fails for any reason, the exception aborts the function and the
  -- delete below never runs.
  v_queued := private.queue_owned_product_media_cleanup(p_product_id, v_product.image, v_product.images, p_actor_id);

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
    'before', to_jsonb(v_product), 'mediaUrls', to_jsonb(coalesce(v_media_urls, array[]::text[])), 'mediaJobsQueued', v_queued
  );
end;
$$;

revoke all on function public.delete_draft_product(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.delete_draft_product(text, uuid, uuid, text) to service_role;

-- Schedules an automatic hard deletion 7 days from now. Only ever
-- succeeds (creates a row) when the product is CURRENTLY fully eligible —
-- no immutable history, no operational blockers, no active hold, no
-- already-active schedule. If it isn't eligible right now, no row is
-- created at all (no impossible admin request, no "blocked" schedule
-- sitting around waiting for a human) — the caller gets the current
-- blockers back and can retry once they clear.
--
-- Idempotency: a replay with the same (product_id, operation_key) is only
-- a safe no-op if the actor and reason also match the original —
-- otherwise a different call is colliding with an old key and must be
-- rejected as IDEMPOTENCY_CONFLICT.
create or replace function public.schedule_product_deletion(
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

  v_normalized_reason := nullif(trim(p_reason), '');

  if p_operation_key is not null then
    select * into v_existing from public.product_deletion_schedules
    where product_id = p_product_id and operation_key = p_operation_key;
    if found then
      if v_existing.initiated_by is distinct from p_actor_id or v_existing.reason is distinct from v_normalized_reason then
        return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT', 'message', 'This idempotency key was already used for a different request.');
      end if;
      return jsonb_build_object('ok', true, 'code', 'DELETION_SCHEDULED', 'message', 'Deletion already scheduled.', 'scheduleId', v_existing.id, 'scheduleState', v_existing.status, 'dueAt', v_existing.due_at);
    end if;
  end if;

  select * into v_existing from public.product_deletion_schedules
  where product_id = p_product_id and status = 'scheduled' for update;
  if found then
    return jsonb_build_object('ok', false, 'code', 'DELETION_ALREADY_SCHEDULED', 'message', 'A deletion is already scheduled for this product.', 'scheduleId', v_existing.id, 'scheduleState', v_existing.status, 'dueAt', v_existing.due_at);
  end if;

  if v_product.status <> 'archived' then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_RETIRED', 'message', 'Retire this product before scheduling permanent deletion.');
  end if;

  v_eligibility := private.compute_product_deletion_eligibility(p_product_id);

  if coalesce((v_eligibility->>'mustRetainHistory')::boolean, false) is true then
    return jsonb_build_object(
      'ok', false, 'code', 'PRODUCT_MUST_BE_RETAINED',
      'message', 'This product has order, review, inventory, warehouse, or return history and must remain retired permanently — it can never be deleted, so no deletion was scheduled.',
      'blockers', v_eligibility->'blockers'
    );
  end if;

  if jsonb_array_length(v_eligibility->'blockers') > 0 then
    return jsonb_build_object(
      'ok', false, 'code', 'PRODUCT_DELETION_BLOCKED',
      'message', 'This product cannot be scheduled for deletion right now — resolve the blockers below and try again.',
      'blockers', v_eligibility->'blockers'
    );
  end if;

  insert into public.product_deletion_schedules (
    product_id, product_name, product_sku, product_image, brand_id,
    initiated_by, initiated_by_label, reason, status, due_at, blocker_snapshot, operation_key
  ) values (
    p_product_id, v_product.name, v_product.sku, v_product.image, v_product.brand_id,
    p_actor_id, p_actor_label, v_normalized_reason, 'scheduled', now() + interval '7 days',
    v_eligibility->'blockers', p_operation_key
  )
  returning * into v_new;

  return jsonb_build_object(
    'ok', true, 'code', 'DELETION_SCHEDULED', 'message', 'Permanent deletion scheduled.',
    'scheduleId', v_new.id, 'scheduleState', v_new.status, 'dueAt', v_new.due_at
  );
end;
$$;

revoke all on function public.schedule_product_deletion(text, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.schedule_product_deletion(text, uuid, uuid, text, text, text) to service_role;

create or replace function public.cancel_product_deletion_schedule(
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
  v_schedule record;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'This product no longer exists.');
  end if;
  if p_brand_id is not null and v_product.brand_id <> p_brand_id then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_OWNED', 'message', 'You do not have access to this product.');
  end if;

  select * into v_schedule from public.product_deletion_schedules
  where product_id = p_product_id and status = 'scheduled' for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'DELETION_SCHEDULE_NOT_FOUND', 'message', 'There is no active deletion schedule for this product.');
  end if;

  update public.product_deletion_schedules
    set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor_id, cancelled_by_label = p_actor_label, updated_at = now()
    where id = v_schedule.id;

  return jsonb_build_object('ok', true, 'code', 'DELETION_SCHEDULE_CANCELLED', 'message', 'Scheduled deletion cancelled.', 'scheduleId', v_schedule.id, 'scheduleState', 'cancelled');
end;
$$;

revoke all on function public.cancel_product_deletion_schedule(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_product_deletion_schedule(text, uuid, uuid, text) to service_role;

-- Admin emergency control: hide/retire immediately regardless of any
-- active deletion schedule. Never deletes anything, never bypasses the
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
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED', 'message', 'A reason is required to hide a product.');
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'This product no longer exists.');
  end if;
  perform id from public.product_variants where product_id = p_product_id for update;

  if v_product.status = 'archived' then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_RETIRED', 'message', 'Already hidden.', 'lifecycle', 'archived');
  end if;

  update public.products set status = 'archived', retired_at = now() where id = p_product_id;

  return jsonb_build_object('ok', true, 'code', 'EMERGENCY_HIDDEN', 'message', 'Product hidden from the storefront.', 'lifecycle', 'archived', 'before', to_jsonb(v_product));
end;
$$;

revoke all on function public.admin_emergency_hide_product(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_emergency_hide_product(text, uuid, text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 6. Legal/Admin hold. An active hold blocks immediate hard deletion,
--    scheduling, and execution of an existing schedule (all enforced via
--    the eligibility calculation's PRODUCT_HAS_ACTIVE_HOLD blocker, which
--    every relevant RPC recomputes fresh). Applying a hold to an already-
--    scheduled product safely stops that schedule (moved to 'blocked',
--    not silently ignored). Releasing a hold never auto-resumes or
--    auto-schedules anything — the owner/admin must call
--    schedule_product_deletion again.
-- ----------------------------------------------------------------------------

create or replace function public.apply_product_deletion_hold(
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
  v_existing record;
  v_schedule record;
  v_hold record;
begin
  if coalesce(nullif(trim(p_reason), ''), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED', 'message', 'A reason is required to apply a hold.');
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'This product no longer exists.');
  end if;

  select * into v_existing from public.product_deletion_holds
  where product_id = p_product_id and status = 'active' for update;
  if found then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_ON_HOLD', 'message', 'This product already has an active hold.', 'holdId', v_existing.id);
  end if;

  select * into v_schedule from public.product_deletion_schedules
  where product_id = p_product_id and status = 'scheduled' for update;
  if found then
    update public.product_deletion_schedules
      set status = 'blocked', blocked_at = now(), blocked_reason = 'A legal/admin hold was applied to this product.', updated_at = now()
      where id = v_schedule.id;
  end if;

  insert into public.product_deletion_holds (product_id, brand_id, reason, created_by, created_by_label)
  values (p_product_id, v_product.brand_id, trim(p_reason), p_actor_id, p_actor_label)
  returning * into v_hold;

  return jsonb_build_object('ok', true, 'code', 'HOLD_APPLIED', 'message', 'Deletion hold applied.', 'holdId', v_hold.id, 'scheduleStopped', v_schedule.id is not null);
end;
$$;

revoke all on function public.apply_product_deletion_hold(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.apply_product_deletion_hold(text, uuid, text, text) to service_role;

create or replace function public.release_product_deletion_hold(
  p_product_id text,
  p_actor_id uuid,
  p_actor_label text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold record;
begin
  select * into v_hold from public.product_deletion_holds
  where product_id = p_product_id and status = 'active' for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'HOLD_NOT_FOUND', 'message', 'There is no active hold on this product.');
  end if;

  update public.product_deletion_holds
    set status = 'released', released_by = p_actor_id, released_by_label = p_actor_label, released_at = now()
    where id = v_hold.id;

  -- Deliberately does not touch any deletion schedule — releasing a hold
  -- must never automatically resume or (re)create a deletion schedule.
  return jsonb_build_object('ok', true, 'code', 'HOLD_RELEASED', 'message', 'Deletion hold released.', 'holdId', v_hold.id);
end;
$$;

revoke all on function public.release_product_deletion_hold(text, uuid, text) from public, anon, authenticated;
grant execute on function public.release_product_deletion_hold(text, uuid, text) to service_role;

-- ----------------------------------------------------------------------------
-- 7. Scheduled-deletion cron executor.
--
-- Concurrency/reliability:
--   - `for update skip locked` claims a bounded batch of due schedules —
--     two concurrent invocations (an overlapping cron run, a manual
--     retrigger) can never grab the same row, so a product is never
--     deleted twice and a schedule is never double-completed.
--   - Each schedule is processed inside its own nested
--     `begin ... exception when others ... end` block, which PL/pgSQL
--     implements via an implicit savepoint — one schedule's unexpected
--     failure rolls back only that schedule's own work and is recorded in
--     the results array, never the rest of the batch already completed in
--     this same call.
--   - Eligibility (including the active-hold check) is recomputed fresh,
--     under lock, for every schedule, with that schedule's own id passed
--     as the ignore-schedule so its own active-state is never treated as
--     a blocker against itself. Any real blocker (new order, new stock,
--     a hold applied mid-grace-period, etc.) flips the schedule to
--     'blocked' instead of deleting anything.
--   - The delete and the schedule's own 'completed' update are the same
--     transaction as the media-cleanup enqueue — a crash between "product
--     deleted" and "schedule marked completed" cannot happen because
--     they're the same statement-level unit of work; if the process dies
--     before commit, nothing in this iteration committed at all (the next
--     cron run picks the still-'scheduled' row back up, unharmed).
--   - Cancellation racing execution: cancel_product_deletion_schedule
--     locks the schedule row exactly like this executor's cursor does
--     (`for update`); whichever transaction gets there first wins, and
--     the loser simply doesn't see a 'scheduled' row to act on (a
--     `skip locked` batch pass simply skips a row a concurrent
--     cancellation is mid-transaction on; the executor's next pass picks
--     it up if it's still 'scheduled' after the cancellation
--     commits — a scheduled row cancelled first mid-way through it being
--     locked here retains its committed 'cancelled' status).
-- ----------------------------------------------------------------------------

create or replace function private.execute_due_product_deletions(p_batch_size integer default 25)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row record;
  v_schedule_id uuid;
  v_product_id text;
  v_product record;
  v_eligibility jsonb;
  v_media_urls text[];
  v_queued integer;
  v_completed integer := 0;
  v_blocked integer := 0;
  v_errored integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  for v_row in
    select id, product_id from public.product_deletion_schedules
    where status = 'scheduled' and due_at <= now()
    order by due_at
    limit greatest(1, least(coalesce(p_batch_size, 25), 200))
    for update skip locked
  loop
    begin
      v_schedule_id := v_row.id;
      v_product_id := v_row.product_id;

      if v_product_id is null then
        update public.product_deletion_schedules set status = 'completed', completed_at = now() where id = v_schedule_id;
        v_completed := v_completed + 1;
        v_results := v_results || jsonb_build_object('scheduleId', v_schedule_id, 'outcome', 'completed');
        continue;
      end if;

      select * into v_product from public.products where id = v_product_id for update;
      perform id from public.product_variants where product_id = v_product_id for update;

      if v_product.id is null then
        -- Product already gone somehow — close the orphaned schedule
        -- rather than leaving it stuck 'scheduled' forever.
        update public.product_deletion_schedules set status = 'completed', completed_at = now() where id = v_schedule_id;
        v_completed := v_completed + 1;
        v_results := v_results || jsonb_build_object('scheduleId', v_schedule_id, 'outcome', 'completed');
        continue;
      end if;

      v_eligibility := private.compute_product_deletion_eligibility(v_product_id, v_schedule_id);
      if coalesce((v_eligibility->>'mustRetainHistory')::boolean, true) is true
         or jsonb_array_length(v_eligibility->'blockers') > 0 then
        update public.product_deletion_schedules
          set status = 'blocked', blocked_at = now(),
              blocked_reason = 'New activity means this product can no longer be safely deleted — it remains retired.',
              blocker_snapshot = v_eligibility->'blockers', updated_at = now()
          where id = v_schedule_id;
        v_blocked := v_blocked + 1;
        v_results := v_results || jsonb_build_object('scheduleId', v_schedule_id, 'productId', v_product_id, 'outcome', 'blocked', 'blockers', v_eligibility->'blockers');
        continue;
      end if;

      v_media_urls := private.capture_owned_product_media_urls(v_product_id, v_product.image, v_product.images);
      v_queued := private.queue_owned_product_media_cleanup(v_product_id, v_product.image, v_product.images, null);

      delete from public.products where id = v_product_id;
      if not found then
        update public.product_deletion_schedules
          set status = 'blocked', blocked_at = now(), blocked_reason = 'The product changed unexpectedly during deletion.', updated_at = now()
          where id = v_schedule_id;
        v_blocked := v_blocked + 1;
        v_results := v_results || jsonb_build_object('scheduleId', v_schedule_id, 'productId', v_product_id, 'outcome', 'blocked');
        continue;
      end if;

      update public.product_deletion_schedules
        set status = 'completed', completed_at = now(),
            product_name = v_product.name, product_sku = v_product.sku, product_image = v_product.image
        where id = v_schedule_id;
      v_completed := v_completed + 1;
      v_results := v_results || jsonb_build_object('scheduleId', v_schedule_id, 'productId', v_product_id, 'outcome', 'completed', 'mediaJobsQueued', v_queued);
    exception when others then
      v_errored := v_errored + 1;
      v_results := v_results || jsonb_build_object('scheduleId', v_schedule_id, 'productId', v_product_id, 'outcome', 'error', 'error', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('completed', v_completed, 'blocked', v_blocked, 'errored', v_errored, 'results', v_results);
end;
$$;

revoke all on function private.execute_due_product_deletions(integer) from public, anon, authenticated;

create or replace function public.execute_due_product_deletions(p_batch_size integer default 25)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.execute_due_product_deletions(p_batch_size);
$$;

revoke all on function public.execute_due_product_deletions(integer) from public, anon, authenticated;
grant execute on function public.execute_due_product_deletions(integer) to service_role;

-- ----------------------------------------------------------------------------
-- 8. Checkout defense-in-depth: an archived/draft/unpublished product can
--    never gain a new order_items row, even via a direct RPC call that
--    skips the app-layer cart/checkout availability checks. Resolves the
--    product through variant_id whenever product_id is null (every real
--    order-placement path sets variant_id), so a caller that only
--    supplies variant_id can't sail through unenforced.
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
-- 9. storefront_products: filters Retired/paused/inactive-brand products
--    for every reader, not only RLS-scoped anon/authenticated queries.
--    Service-role reads (lib/cart/liveValidation.ts, lib/payments/
--    intentionCart.ts, checkout RPCs) bypass RLS entirely, so the view
--    itself must carry this predicate.
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
-- 10. Admin/brand-portal Retired-tab + deletion-schedule search — single
--     paginated, filtered, database-level RPCs. Neither ever loads a full
--     table into memory: status/brand/partner/text filters and
--     LIMIT/OFFSET are all applied inside Postgres.
-- ----------------------------------------------------------------------------

create or replace function private.admin_search_deletion_schedules(
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
  from public.product_deletion_schedules s
  join public.brands b on b.id = s.brand_id
  where (p_status is null or s.status = p_status)
    and (p_brand_id is null or s.brand_id = p_brand_id)
    and (p_is_partner is null or b.is_mahaly_partner = p_is_partner)
    and (
      v_search is null
      or s.id::text ilike '%' || v_search || '%'
      or s.product_id ilike '%' || v_search || '%'
      or s.product_name ilike '%' || v_search || '%'
      or b.name ilike '%' || v_search || '%'
    );

  select coalesce(jsonb_agg(row_data order by scheduled_at desc), '[]'::jsonb) into v_rows
  from (
    select
      jsonb_build_object(
        'id', s.id, 'productId', s.product_id, 'brandId', s.brand_id,
        'productName', s.product_name, 'productSku', s.product_sku, 'productImage', s.product_image,
        'initiatedByLabel', s.initiated_by_label, 'scheduledAt', s.scheduled_at, 'dueAt', s.due_at, 'reason', s.reason,
        'status', s.status, 'cancelledAt', s.cancelled_at, 'cancelledByLabel', s.cancelled_by_label,
        'blockedAt', s.blocked_at, 'blockedReason', s.blocked_reason,
        'completedAt', s.completed_at, 'blockerSnapshot', s.blocker_snapshot,
        'brandName', b.name, 'brandSlug', b.slug, 'brandIsPartner', b.is_mahaly_partner,
        'hasActiveHold', exists(select 1 from public.product_deletion_holds h where h.product_id = s.product_id and h.status = 'active')
      ) as row_data,
      s.scheduled_at
    from public.product_deletion_schedules s
    join public.brands b on b.id = s.brand_id
    where (p_status is null or s.status = p_status)
      and (p_brand_id is null or s.brand_id = p_brand_id)
      and (p_is_partner is null or b.is_mahaly_partner = p_is_partner)
      and (
        v_search is null
        or s.id::text ilike '%' || v_search || '%'
        or s.product_id ilike '%' || v_search || '%'
        or s.product_name ilike '%' || v_search || '%'
        or b.name ilike '%' || v_search || '%'
      )
    order by s.scheduled_at desc
    limit v_limit offset v_offset
  ) page;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'limit', v_limit, 'offset', v_offset);
end;
$$;

revoke all on function private.admin_search_deletion_schedules(text, uuid, boolean, text, integer, integer) from public, anon, authenticated;

create or replace function public.admin_search_deletion_schedules(
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
  select private.admin_search_deletion_schedules(p_status, p_brand_id, p_is_partner, p_search, p_limit, p_offset);
$$;

revoke all on function public.admin_search_deletion_schedules(text, uuid, boolean, text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_search_deletion_schedules(text, uuid, boolean, text, integer, integer) to service_role;

-- Paginated, database-level "Retired" product list — used by both Brand
-- Portal (p_brand_id required) and Admin (p_brand_id null = all brands).
-- Never loads a full catalog into memory: status = 'archived' plus
-- search/pagination are applied inside Postgres, and each row's deletion-
-- eligibility badge is computed inline via a lateral join to the same
-- canonical eligibility function every mutation RPC uses (never a second,
-- divergent implementation).
create or replace function private.search_retired_products(
  p_brand_id uuid default null,
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
  from public.products p
  where p.status = 'archived'
    and (p_brand_id is null or p.brand_id = p_brand_id)
    and (v_search is null or p.name ilike '%' || v_search || '%' or p.sku ilike '%' || v_search || '%' or p.id ilike '%' || v_search || '%');

  select coalesce(jsonb_agg(row_data order by retired_at desc nulls last), '[]'::jsonb) into v_rows
  from (
    select
      jsonb_build_object(
        'id', p.id, 'name', p.name, 'sku', p.sku, 'image', p.image, 'brandId', p.brand_id, 'brandName', p.brand_name,
        'eligibility', private.compute_product_deletion_eligibility(p.id),
        'activeSchedule', (
          select jsonb_build_object('id', sch.id, 'status', sch.status, 'dueAt', sch.due_at)
          from public.product_deletion_schedules sch
          where sch.product_id = p.id and sch.status = 'scheduled'
          limit 1
        )
      ) as row_data,
      -- Pre-migration archived rows have no known retirement date
      -- (retired_at only starts getting set by retire_product/emergency-
      -- hide going forward) — they sort after everything with a known
      -- date rather than being mutated to fabricate one.
      p.retired_at
    from public.products p
    where p.status = 'archived'
      and (p_brand_id is null or p.brand_id = p_brand_id)
      and (v_search is null or p.name ilike '%' || v_search || '%' or p.sku ilike '%' || v_search || '%' or p.id ilike '%' || v_search || '%')
    order by p.retired_at desc nulls last
    limit v_limit offset v_offset
  ) page;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'limit', v_limit, 'offset', v_offset);
end;
$$;

revoke all on function private.search_retired_products(uuid, text, integer, integer) from public, anon, authenticated;

create or replace function public.search_retired_products(
  p_brand_id uuid default null,
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
  select private.search_retired_products(p_brand_id, p_search, p_limit, p_offset);
$$;

revoke all on function public.search_retired_products(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.search_retired_products(uuid, text, integer, integer) to service_role;
