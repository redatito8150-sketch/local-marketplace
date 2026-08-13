-- ============================================================================
-- Explicit, database-owned fulfillment mode + an auditable transition
-- workflow for switching a brand between modes.
--
-- brands.is_mahaly_partner (a plain boolean, freely toggleable by any admin
-- via app/api/admin/brands/[slug]/quick-toggle/route.ts with zero business
-- checks) already drives order bucket-pooling (place_order/place_paid_order),
-- the "0-stock variant can still publish" gate (lib/admin/productValidation.ts),
-- and every warehouse-transfer RPC's partner gate. Rather than touch every
-- one of those call sites, this migration adds `fulfillment_mode` as the new
-- authoritative column and keeps `is_mahaly_partner` in permanent lockstep
-- via a trigger — every existing reader of is_mahaly_partner keeps working
-- unchanged. A second trigger then blocks any ordinary UPDATE from changing
-- either column outside the new transition RPCs (which set a session-local
-- guard flag for the duration of their own transaction).
--
-- Historical orders already carry their own immutable fulfillment snapshot —
-- orders.fulfillment_type ('mahaly_pool' | 'brand_direct') is set once, at
-- place_order() time, from the brand's is_mahaly_partner *at that moment*,
-- and is never rewritten afterward. A later fulfillment_mode switch on the
-- brand can therefore never retroactively change what an old order shows —
-- verified by a new test rather than by any new column here.
-- ============================================================================

alter table public.brands
  add column if not exists fulfillment_mode text;

update public.brands
set fulfillment_mode = case when is_mahaly_partner then 'zakhnook_fulfilled' else 'brand_fulfilled' end
where fulfillment_mode is null;

alter table public.brands
  alter column fulfillment_mode set default 'brand_fulfilled',
  alter column fulfillment_mode set not null;

alter table public.brands drop constraint if exists brands_fulfillment_mode_check;
alter table public.brands add constraint brands_fulfillment_mode_check
  check (fulfillment_mode in ('brand_fulfilled', 'zakhnook_fulfilled'));

create index if not exists brands_fulfillment_mode_idx on public.brands (fulfillment_mode);

-- Keeps every existing is_mahaly_partner reader correct with zero code
-- changes elsewhere. Runs on INSERT too so a brand created with an explicit
-- fulfillment_mode gets the matching partner flag from day one.
create or replace function public.sync_is_mahaly_partner_from_fulfillment_mode()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.is_mahaly_partner := (new.fulfillment_mode = 'zakhnook_fulfilled');
  return new;
end;
$$;

drop trigger if exists brands_sync_is_mahaly_partner on public.brands;
create trigger brands_sync_is_mahaly_partner
before insert or update on public.brands
for each row execute function public.sync_is_mahaly_partner_from_fulfillment_mode();

-- Blocks a bare `update brands set fulfillment_mode = ...` (or an
-- is_mahaly_partner write that implies a mode change) from taking effect
-- outside the transition RPCs below, which set
-- `app.fulfillment_transition_in_progress = 'true'` (session-local, cleared
-- automatically at transaction end) for the exact statement that performs
-- the real switch. A plain insert (new brand row) is never blocked — only
-- an UPDATE that actually changes the derived mode on an existing row.
create or replace function public.guard_fulfillment_mode_direct_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.fulfillment_mode is distinct from old.fulfillment_mode
     and coalesce(current_setting('app.fulfillment_transition_in_progress', true), '') <> 'true' then
    raise exception 'FULFILLMENT_MODE_DIRECT_UPDATE_FORBIDDEN: use the fulfillment transition workflow';
  end if;
  return new;
end;
$$;

drop trigger if exists brands_guard_fulfillment_mode_direct_update on public.brands;
create trigger brands_guard_fulfillment_mode_direct_update
before update on public.brands
for each row execute function public.guard_fulfillment_mode_direct_update();

-- ============================================================================
-- brand_fulfillment_transitions — one row per attempted mode switch. Every
-- transition (successful, cancelled, or failed) is kept forever; nothing is
-- ever deleted or overwritten in a way that loses the audit trail (only
-- status/timestamps/blockers/notes ever change on an in-progress row).
-- ============================================================================
create table public.brand_fulfillment_transitions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  from_mode text not null check (from_mode in ('brand_fulfilled', 'zakhnook_fulfilled')),
  to_mode text not null check (to_mode in ('brand_fulfilled', 'zakhnook_fulfilled')),
  status text not null default 'requested' check (status in (
    'requested', 'validating', 'scheduled', 'awaiting_stock_transfer',
    'ready_to_activate', 'completed', 'cancelled', 'failed'
  )),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  effective_date timestamptz,
  processed_by uuid references auth.users(id) on delete set null,
  processed_at timestamptz,
  stock_snapshot jsonb,
  validation_blockers jsonb not null default '[]'::jsonb,
  notes text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  operation_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_mode <> to_mode)
);

create index brand_fulfillment_transitions_brand_status_idx
  on public.brand_fulfillment_transitions (brand_id, status, requested_at desc);

-- Exactly one non-terminal transition per brand at a time — the atomic
-- partial unique index a plain application-level check can't guarantee
-- under concurrency.
create unique index brand_fulfillment_transitions_one_open_per_brand_idx
  on public.brand_fulfillment_transitions (brand_id)
  where status not in ('completed', 'cancelled', 'failed');

alter table public.brand_fulfillment_transitions enable row level security;

drop policy if exists "Brand members can read their fulfillment transitions" on public.brand_fulfillment_transitions;
create policy "Brand members can read their fulfillment transitions"
on public.brand_fulfillment_transitions for select to authenticated
using (
  exists (
    select 1 from public.brands b
    where b.id = brand_fulfillment_transitions.brand_id
      and b.owner_user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.brand_staff bs
    where bs.brand_id = brand_fulfillment_transitions.brand_id
      and bs.user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_admin
  )
);

grant select on public.brand_fulfillment_transitions to authenticated;
grant all on public.brand_fulfillment_transitions to service_role;
revoke insert, update, delete on public.brand_fulfillment_transitions from anon, authenticated;

-- Links a warehouse document to the transition that (indirectly) caused it
-- — set by request_warehouse_transfer (supabase/migrations/
-- 20260814000003_warehouse_documents.sql) when a brand_fulfilled brand with
-- an open brand->zakhnook transition declares a shipment. Lets
-- cancel_fulfillment_transition below tell "nothing has physically moved
-- yet, safe to fully revert" apart from "some of this stock already
-- reached Zakhnook — a plain revert would silently lose track of it."
alter table public.warehouse_transfers
  add column if not exists related_fulfillment_transition_id uuid
    references public.brand_fulfillment_transitions(id) on delete set null;
create index if not exists warehouse_transfers_related_fulfillment_transition_idx
  on public.warehouse_transfers (related_fulfillment_transition_id)
  where related_fulfillment_transition_id is not null;

-- ============================================================================
-- Blocker computation — shared by request/revalidate/activate so the three
-- entry points can never disagree about what's still open. Returns a jsonb
-- array of short blocker codes (never free text — the API layer maps codes
-- to human copy, same convention as this codebase's other RPC error codes).
-- ============================================================================
create or replace function private.compute_fulfillment_transition_blockers(
  p_brand_id uuid,
  p_to_mode text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_blockers jsonb := '[]'::jsonb;
  v_open_stock numeric;
  v_open_transfers integer;
  v_brand_slug text;
  v_open_payment_attempts integer;
begin
  -- Card-payment race (second corrective pass, item 3): a Paymob intention
  -- created just before this transition started can still be sitting
  -- in-flight (created/pending/paid/reflecting — not yet fulfilled,
  -- fulfillment_failed, failed, expired, or cancelled). Activating while
  -- one exists risks the exact "charged but place_paid_order refuses to
  -- fulfill" scenario the intention route's own new
  -- fetchOpenTransitionBrandSlugs check prevents from starting fresh — this
  -- blocker instead protects an attempt that was already in flight the
  -- moment this transition was requested. Applies to BOTH directions: the
  -- ambiguity is about which physical location fulfills the order, which
  -- is unresolved regardless of which way the brand is switching.
  select slug into v_brand_slug from public.brands where id = p_brand_id;
  select count(*) into v_open_payment_attempts
  from public.payment_attempts pa
  where pa.status in ('created', 'pending', 'paid', 'reflecting')
    and exists (
      select 1 from jsonb_array_elements(coalesce(pa.cart_snapshot, '[]'::jsonb)) as item
      where item ->> 'brandSlug' = v_brand_slug
    );
  if v_open_payment_attempts > 0 then
    v_blockers := v_blockers || jsonb_build_array('OPEN_PAYMENT_ATTEMPT_PENDING');
  end if;

  if p_to_mode = 'zakhnook_fulfilled' then
    -- Remaining brand-held sellable stock must be fully declared/shipped
    -- and received by Zakhnook before this brand can go live as partner.
    select coalesce(sum(pv.brand_stock_quantity), 0) into v_open_stock
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where p.brand_id = p_brand_id and pv.is_archived = false;
    if v_open_stock > 0 then
      v_blockers := v_blockers || jsonb_build_array('REMAINING_STOCK_NOT_YET_TRANSFERRED');
    end if;

    select count(*) into v_open_transfers
    from public.warehouse_transfers
    where brand_id = p_brand_id and direction = 'to_local'
      and status not in ('received', 'rejected', 'cancelled');
    if v_open_transfers > 0 then
      v_blockers := v_blockers || jsonb_build_array('OPEN_INBOUND_TRANSFER_PENDING');
    end if;
  else
    -- Zakhnook-held sellable stock must sell through or be returned to the
    -- brand (an auditable outbound Stock Return Note) before deactivating
    -- partner status; any open transfer/return must be resolved too.
    select coalesce(sum(pv.quantity), 0) into v_open_stock
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where p.brand_id = p_brand_id and pv.is_archived = false;
    if v_open_stock > 0 then
      v_blockers := v_blockers || jsonb_build_array('ZAKHNOOK_STOCK_NOT_YET_RESOLVED');
    end if;

    select count(*) into v_open_transfers
    from public.warehouse_transfers
    where brand_id = p_brand_id
      and status not in ('received', 'rejected', 'cancelled');
    if v_open_transfers > 0 then
      v_blockers := v_blockers || jsonb_build_array('OPEN_WAREHOUSE_DOCUMENT_PENDING');
    end if;
  end if;

  return v_blockers;
end;
$$;

-- ============================================================================
-- request_fulfillment_mode_transition — creates the transition row and
-- immediately validates it once (requested -> validating -> either
-- ready_to_activate, or awaiting_stock_transfer/scheduled with blockers
-- recorded). For brand_fulfilled -> zakhnook_fulfilled with brand-held
-- stock, this is also the moment that stock is atomically snapshotted out
-- of `quantity` (no longer sellable — cutover has begun, "prevent new
-- unsafe adjustments during cutover") and into `brand_stock_quantity` (so
-- the existing request_warehouse_transfer/receive flow can move it to
-- Zakhnook exactly like an ordinary partner-brand transfer).
--
-- Idempotency: the brand row is locked FIRST (establishes the brand-then-
-- everything-else lock order every transition/adjustment RPC now follows),
-- THEN the operation_key is checked — and a match only counts as a safe
-- replay if it belongs to the SAME brand and targets the SAME mode; any
-- other match (a reused key against a different brand/target) is an
-- explicit IDEMPOTENCY_CONFLICT, never silently treated as a replay. A
-- concurrent request for a different brand racing on the same key is
-- caught by the table's own unique constraint and re-checked the same way.
-- ============================================================================
create or replace function public.request_fulfillment_mode_transition(
  p_brand_id uuid,
  p_to_mode text,
  p_actor_id uuid,
  p_notes text,
  p_effective_date timestamptz,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from_mode text;
  v_transition_id uuid;
  v_existing record;
  v_blockers jsonb;
  v_status text;
  v_snapshot jsonb;
  v_lock record;
  v_original_quantity integer;
begin
  if p_to_mode not in ('brand_fulfilled', 'zakhnook_fulfilled') then
    raise exception 'INVALID_FULFILLMENT_MODE';
  end if;
  if nullif(pg_catalog.btrim(p_operation_key), '') is null or length(p_operation_key) > 160 then
    raise exception 'INVALID_OPERATION_KEY';
  end if;

  select fulfillment_mode into v_from_mode from public.brands where id = p_brand_id for update;
  if v_from_mode is null then raise exception 'BRAND_NOT_FOUND'; end if;

  select id, brand_id, to_mode into v_existing
  from public.brand_fulfillment_transitions
  where operation_key = p_operation_key;
  if v_existing.id is not null then
    if v_existing.brand_id = p_brand_id and v_existing.to_mode = p_to_mode then
      return jsonb_build_object('transition_id', v_existing.id, 'replayed', true);
    end if;
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  if v_from_mode = p_to_mode then raise exception 'BRAND_ALREADY_IN_TARGET_MODE'; end if;

  if exists (
    select 1 from public.brand_fulfillment_transitions
    where brand_id = p_brand_id and status not in ('completed', 'cancelled', 'failed')
  ) then
    raise exception 'FULFILLMENT_TRANSITION_ALREADY_OPEN';
  end if;

  select jsonb_agg(jsonb_build_object(
    'variant_id', pv.id, 'sku', pv.sku, 'quantity', pv.quantity,
    'brand_stock_quantity', pv.brand_stock_quantity
  )) into v_snapshot
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  where p.brand_id = p_brand_id and pv.is_archived = false;

  begin
    insert into public.brand_fulfillment_transitions (
      brand_id, from_mode, to_mode, status, requested_by, effective_date,
      notes, stock_snapshot, operation_key
    ) values (
      p_brand_id, v_from_mode, p_to_mode, 'validating', p_actor_id, p_effective_date,
      nullif(pg_catalog.btrim(p_notes), ''), coalesce(v_snapshot, '[]'::jsonb), p_operation_key
    ) returning id into v_transition_id;
  exception when unique_violation then
    -- Lost a genuine concurrent race on operation_key — re-check exactly
    -- like the pre-check above rather than assuming it's safe.
    select id, brand_id, to_mode into v_existing
    from public.brand_fulfillment_transitions
    where operation_key = p_operation_key;
    if v_existing.id is not null and v_existing.brand_id = p_brand_id and v_existing.to_mode = p_to_mode then
      return jsonb_build_object('transition_id', v_existing.id, 'replayed', true);
    end if;
    raise exception 'IDEMPOTENCY_CONFLICT';
  end;

  if p_to_mode = 'zakhnook_fulfilled' then
    -- Cutover snapshot: brand-held sellable stock stops being sellable and
    -- becomes "declared, awaiting inbound transfer" — deterministic variant
    -- lock order avoids deadlocks against any concurrent adjustment. The
    -- original quantity is captured from the locking cursor itself
    -- (v_lock.quantity) BEFORE the UPDATE zeroes it — the ledger row must
    -- record what the balance actually was, not re-read it afterward.
    for v_lock in
      select pv.id, pv.quantity
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      where p.brand_id = p_brand_id and pv.is_archived = false and pv.quantity > 0
      order by pv.id
      for update of pv
    loop
      v_original_quantity := v_lock.quantity;

      update public.product_variants
      set brand_stock_quantity = brand_stock_quantity + v_original_quantity,
          quantity = 0,
          updated_at = now()
      where id = v_lock.id;

      insert into public.inventory_movements (
        variant_id, product_id, brand_id, previous_quantity, quantity_delta,
        new_quantity, movement_type, reason, note, created_by, source,
        source_operation_key, from_location, to_location,
        related_entity_type, related_entity_id
      )
      select pv.id, pv.product_id, p_brand_id, v_original_quantity, -v_original_quantity, 0,
        'fulfillment_transition_snapshot', 'Fulfillment mode transition — cutover snapshot',
        nullif(pg_catalog.btrim(p_notes), ''), p_actor_id, 'fulfillment_transition',
        'fulfillment-transition-snapshot:' || v_transition_id::text || ':' || v_lock.id::text,
        'brand_location', 'in_transit_to_zakhnook', 'fulfillment_transition', v_transition_id
      from public.product_variants pv where pv.id = v_lock.id
      on conflict (variant_id, source_operation_key) do nothing;
    end loop;
  end if;

  v_blockers := private.compute_fulfillment_transition_blockers(p_brand_id, p_to_mode);
  v_status := case when jsonb_array_length(v_blockers) = 0 then 'ready_to_activate'
    when p_to_mode = 'zakhnook_fulfilled' then 'awaiting_stock_transfer'
    else 'scheduled' end;

  update public.brand_fulfillment_transitions
  set status = v_status, validation_blockers = v_blockers, updated_at = now()
  where id = v_transition_id;

  return jsonb_build_object('transition_id', v_transition_id, 'status', v_status, 'blockers', v_blockers, 'replayed', false);
end;
$$;

-- Re-checks blockers on an in-progress transition (called after a transfer
-- is received, an order finishes, etc. — or just polled) and advances its
-- status accordingly. Can also move a cleared transition BACK to a blocked
-- state if e.g. new stock reappeared — blockers are always recomputed from
-- current reality, never just monotonically cleared.
create or replace function public.revalidate_fulfillment_transition(
  p_transition_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transition record;
  v_blockers jsonb;
  v_status text;
begin
  select id, brand_id, to_mode, status into v_transition
  from public.brand_fulfillment_transitions
  where id = p_transition_id
  for update;
  if v_transition.id is null then raise exception 'TRANSITION_NOT_FOUND'; end if;
  if v_transition.status in ('completed', 'cancelled', 'failed') then
    raise exception 'TRANSITION_ALREADY_TERMINAL';
  end if;

  v_blockers := private.compute_fulfillment_transition_blockers(v_transition.brand_id, v_transition.to_mode);
  v_status := case when jsonb_array_length(v_blockers) = 0 then 'ready_to_activate'
    when v_transition.to_mode = 'zakhnook_fulfilled' then 'awaiting_stock_transfer'
    else 'scheduled' end;

  update public.brand_fulfillment_transitions
  set status = v_status, validation_blockers = v_blockers,
      processed_by = p_actor_id, processed_at = now(), updated_at = now()
  where id = p_transition_id;

  return jsonb_build_object('transition_id', p_transition_id, 'status', v_status, 'blockers', v_blockers);
end;
$$;

-- Atomically flips brands.fulfillment_mode. Re-validates blockers one final
-- time under lock (never trusts a stale 'ready_to_activate' status if
-- reality changed in between) and — for zakhnook_fulfilled -> brand_fulfilled
-- — moves any residual brand_stock_quantity (credited back by a received
-- return) into `quantity`, since that's the column brand_fulfilled brands'
-- storefront stock is read from.
--
-- effective_date is enforced here, not just stored: activation before it is
-- rejected outright rather than silently ignoring the scheduling request.
create or replace function public.activate_fulfillment_mode_transition(
  p_transition_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transition record;
  v_blockers jsonb;
  v_lock record;
begin
  select id, brand_id, from_mode, to_mode, status, effective_date into v_transition
  from public.brand_fulfillment_transitions
  where id = p_transition_id
  for update;
  if v_transition.id is null then raise exception 'TRANSITION_NOT_FOUND'; end if;
  if v_transition.status in ('completed', 'cancelled', 'failed') then
    raise exception 'TRANSITION_ALREADY_TERMINAL';
  end if;
  if v_transition.effective_date is not null and v_transition.effective_date > now() then
    raise exception 'EFFECTIVE_DATE_NOT_REACHED';
  end if;

  v_blockers := private.compute_fulfillment_transition_blockers(v_transition.brand_id, v_transition.to_mode);
  if jsonb_array_length(v_blockers) > 0 then
    update public.brand_fulfillment_transitions
    set validation_blockers = v_blockers,
        status = case when v_transition.to_mode = 'zakhnook_fulfilled' then 'awaiting_stock_transfer' else 'scheduled' end,
        updated_at = now()
    where id = p_transition_id;
    raise exception 'FULFILLMENT_TRANSITION_STILL_BLOCKED';
  end if;

  if v_transition.to_mode = 'brand_fulfilled' then
    for v_lock in
      select pv.id
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      where p.brand_id = v_transition.brand_id and pv.is_archived = false and pv.brand_stock_quantity > 0
      order by pv.id
      for update of pv
    loop
      insert into public.inventory_movements (
        variant_id, product_id, brand_id, previous_quantity, quantity_delta,
        new_quantity, movement_type, reason, created_by, source,
        source_operation_key, from_location, to_location,
        related_entity_type, related_entity_id
      )
      select pv.id, pv.product_id, v_transition.brand_id, pv.quantity, pv.brand_stock_quantity,
        pv.quantity + pv.brand_stock_quantity, 'fulfillment_transition_snapshot',
        'Fulfillment mode transition — activation', p_actor_id, 'fulfillment_transition',
        'fulfillment-transition-activate:' || p_transition_id::text || ':' || v_lock.id::text,
        'returned_to_brand', 'brand_location', 'fulfillment_transition', p_transition_id
      from public.product_variants pv where pv.id = v_lock.id
      on conflict (variant_id, source_operation_key) do nothing;

      update public.product_variants
      set quantity = quantity + brand_stock_quantity, brand_stock_quantity = 0, updated_at = now()
      where id = v_lock.id;
    end loop;
  end if;

  perform set_config('app.fulfillment_transition_in_progress', 'true', true);
  update public.brands
  set fulfillment_mode = v_transition.to_mode
  where id = v_transition.brand_id;

  update public.brand_fulfillment_transitions
  set status = 'completed', processed_by = p_actor_id, processed_at = now(),
      completed_at = now(), validation_blockers = '[]'::jsonb, updated_at = now()
  where id = p_transition_id;

  return jsonb_build_object('transition_id', p_transition_id, 'status', 'completed', 'new_mode', v_transition.to_mode);
end;
$$;

-- Direction-aware cancellation (second corrective pass, item 4):
--
-- brand_fulfilled -> zakhnook_fulfilled (to_mode = 'zakhnook_fulfilled'):
--   This direction's request step snapshots brand-held quantity INTO
--   brand_stock_quantity (see request_fulfillment_mode_transition above),
--   so cancellation reverting brand_stock_quantity back onto quantity is
--   the correct undo — but only for the portion that hasn't already moved:
--   a linked inbound document (Stock Transfer Note) that's already
--   in_transit/receiving/partially_received/received represents stock that
--   has genuinely started moving or already arrived, so cancellation is
--   blocked outright for those. A linked document still in an early,
--   nothing-has-shipped-yet state (draft/pending/submitted/approved) is
--   instead atomically auto-cancelled here — otherwise it would be left
--   orphaned, pointing at a transition that no longer exists, backed by
--   brand_stock_quantity that this same call is about to revert out from
--   under it.
--
-- zakhnook_fulfilled -> brand_fulfilled (to_mode = 'brand_fulfilled'):
--   This direction's request step never snapshots anything — the brand
--   stays a full partner (is_mahaly_partner/fulfillment_mode untouched)
--   for the whole transition, and any brand_stock_quantity present is
--   ordinary, pre-existing partner-brand consignment bookkeeping wholly
--   UNRELATED to this transition. Moving it into sellable `quantity` here
--   would be a real bug: it would make stock that isn't physically at
--   Zakhnook sellable, for a brand that is still zakhnook_fulfilled after
--   this cancellation. So this direction never touches
--   brand_stock_quantity/quantity at all. It only needs the same linked-
--   document handling, applied to this transition's own outbound Stock
--   Return Note(s) (direction 'to_brand', linked via
--   related_fulfillment_transition_id — see request_warehouse_return's own
--   updated linking logic) instead of inbound transfers: block cancellation
--   once any linked return has been partially or fully received by the
--   brand, auto-cancel (releasing any reservation) the ones still safely
--   cancellable.
create or replace function public.cancel_fulfillment_transition(
  p_transition_id uuid,
  p_actor_id uuid,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transition record;
  v_lock record;
  v_doc record;
  v_progressed_count integer;
  v_in_transit_count integer;
begin
  select id, brand_id, status, to_mode into v_transition
  from public.brand_fulfillment_transitions
  where id = p_transition_id
  for update;
  if v_transition.id is null then raise exception 'TRANSITION_NOT_FOUND'; end if;
  if v_transition.status in ('completed', 'cancelled', 'failed') then
    raise exception 'TRANSITION_ALREADY_TERMINAL';
  end if;

  -- Shared by both directions: any linked document already
  -- received/partially_received means real stock has already moved —
  -- only resolvable by an auditable reverse movement first, never by this
  -- cancellation.
  select count(*) into v_progressed_count
  from public.warehouse_transfers
  where related_fulfillment_transition_id = p_transition_id
    and status in ('received', 'partially_received');
  if v_progressed_count > 0 then
    raise exception 'FULFILLMENT_TRANSITION_CANNOT_CANCEL_STOCK_ALREADY_RECEIVED';
  end if;

  -- Also shared: a linked document that's in_transit/receiving represents
  -- goods physically moving right now — not safely auto-cancellable, and
  -- not yet "received" either, so the check above alone wouldn't catch it.
  select count(*) into v_in_transit_count
  from public.warehouse_transfers
  where related_fulfillment_transition_id = p_transition_id
    and status in ('in_transit', 'receiving');
  if v_in_transit_count > 0 then
    raise exception 'FULFILLMENT_TRANSITION_CANNOT_CANCEL_DOCUMENT_IN_TRANSIT';
  end if;

  -- Auto-cancel every linked document still in an early, nothing-has-
  -- shipped-yet state — for either direction, cancel_warehouse_document
  -- already knows how to safely release a to_brand reservation (a to_local
  -- document never reserves anything at request time, so that release is
  -- simply a no-op for this direction). Locked in a deterministic order
  -- (by id) to avoid deadlocking against a concurrent cancellation of the
  -- same set of documents.
  for v_doc in
    select id from public.warehouse_transfers
    where related_fulfillment_transition_id = p_transition_id
      and status in ('draft', 'pending', 'submitted', 'approved')
    order by id
  loop
    perform public.cancel_warehouse_document(v_doc.id, p_actor_id, 'Auto-cancelled: fulfillment transition cancelled');
  end loop;

  if v_transition.to_mode = 'zakhnook_fulfilled' then
    -- Undo the brand_fulfilled -> zakhnook_fulfilled cutover snapshot —
    -- everything still sitting un-shipped in brand_stock_quantity (the
    -- linked documents just handled above are now all terminal, so
    -- whatever remains here genuinely never left the brand).
    for v_lock in
      select pv.id
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      where p.brand_id = v_transition.brand_id and pv.is_archived = false and pv.brand_stock_quantity > 0
      order by pv.id
      for update of pv
    loop
      insert into public.inventory_movements (
        variant_id, product_id, brand_id, previous_quantity, quantity_delta,
        new_quantity, movement_type, reason, note, created_by, source,
        source_operation_key, from_location, to_location,
        related_entity_type, related_entity_id
      )
      select pv.id, pv.product_id, v_transition.brand_id, pv.quantity, pv.brand_stock_quantity,
        pv.quantity + pv.brand_stock_quantity, 'fulfillment_transition_snapshot',
        'Fulfillment mode transition cancelled — stock reverted',
        nullif(pg_catalog.btrim(p_notes), ''), p_actor_id, 'fulfillment_transition',
        'fulfillment-transition-cancel:' || p_transition_id::text || ':' || v_lock.id::text,
        'in_transit_to_zakhnook', 'brand_location', 'fulfillment_transition', p_transition_id
      from public.product_variants pv where pv.id = v_lock.id
      on conflict (variant_id, source_operation_key) do nothing;

      update public.product_variants
      set quantity = quantity + brand_stock_quantity, brand_stock_quantity = 0, updated_at = now()
      where id = v_lock.id;
    end loop;
  end if;
  -- to_mode = 'brand_fulfilled': deliberately no stock movement at all —
  -- see this function's header comment for why touching brand_stock_quantity
  -- here would be a bug, not a fix.

  update public.brand_fulfillment_transitions
  set status = 'cancelled', cancelled_at = now(), processed_by = p_actor_id,
      processed_at = now(), notes = coalesce(nullif(pg_catalog.btrim(p_notes), ''), notes), updated_at = now()
  where id = p_transition_id;

  return jsonb_build_object('transition_id', p_transition_id, 'status', 'cancelled');
end;
$$;

revoke all on function public.request_fulfillment_mode_transition(uuid, text, uuid, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.request_fulfillment_mode_transition(uuid, text, uuid, text, timestamptz, text)
  to service_role;

revoke all on function public.revalidate_fulfillment_transition(uuid, uuid) from public, anon, authenticated;
grant execute on function public.revalidate_fulfillment_transition(uuid, uuid) to service_role;

revoke all on function public.activate_fulfillment_mode_transition(uuid, uuid) from public, anon, authenticated;
grant execute on function public.activate_fulfillment_mode_transition(uuid, uuid) to service_role;

revoke all on function public.cancel_fulfillment_transition(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_fulfillment_transition(uuid, uuid, text) to service_role;

revoke all on function private.compute_fulfillment_transition_blockers(uuid, text)
  from public, anon, authenticated, service_role;
