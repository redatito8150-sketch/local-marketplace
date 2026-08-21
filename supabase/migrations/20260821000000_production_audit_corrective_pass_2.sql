-- ============================================================================
-- Corrective pass 2 — response to the reviewer's rejection of the first
-- corrective pass (supabase/migrations/20260820000001_production_audit_
-- corrective_fixes.sql) against docs/audits/2026-08-20-production-security-
-- correctness-reliability-audit-en.md. That migration is left untouched
-- (never edit an already-committed migration in this repo); every fix and
-- correction below is additive/forward-only, via create-or-replace, new
-- tables, or new triggers.
--
-- Forward-only. Not applied to any database by this pass — see the
-- corrective-pass-2 report for required apply order, backfill behavior, and
-- the production read-only verification queries for CFG-01 (Section 8).
-- ============================================================================


-- ============================================================================
-- SECTION 1 — Refund and paid-card cancellation integrity
-- ============================================================================
-- The first pass's mark_payment_attempt_refund_recorded let an optional
-- manual note flip payment_attempts.refunded_at, which cancel_order then
-- trusted to unlock restocking a captured card order — no amount, no
-- currency, no provider reference, no idempotency, and (worse) it blindly
-- set EVERY sibling order under the same master_order_id to
-- payment_status = 'refunded' regardless of what was actually refunded.
--
-- Replaced with a real ledger (payment_refunds) and two narrow, disjoint
-- RPCs:
--   - record_order_refund: the ONLY way a specific order's payment_status
--     can move to 'refunded'/'partially_refunded'. Requires an exact
--     amount and a provider reference, is idempotent on that reference,
--     and can never refund more than the order's own captured amount
--     (private.payment_attempt_fulfillments.expected_amount_cents for that
--     order — the same figure list_payment_attempts_needing_refund_review
--     already trusted as the captured total for a bucket).
--   - record_payment_attempt_refund: the successor to
--     mark_payment_attempt_refund_recorded, narrowed to ONLY the case it
--     was ever actually needed for — a captured attempt with a FAILED
--     bucket that never became an order at all, so there is no order to
--     attach the refund to. It can never touch orders.payment_status.
--
-- Neither RPC calls Paymob's Refund API — both record that an admin
-- already processed a real refund (via Paymob's own dashboard, since no
-- Sandbox-verified API integration exists yet) and is now attesting to its
-- exact amount and provider reference. This is deliberately NOT a
-- simulation of provider confirmation: nothing here invents or guesses
-- whether Paymob actually refunded the money. It is the explicit
-- refund-pending-until-attested workflow the finding asked for in place of
-- unsafe live API confirmation — cancellation of a captured card order
-- stays blocked for as long as no such attested record exists or covers
-- less than the full captured amount, and unblocks the moment (and only
-- the moment) one attested record's amount reaches the captured total.
-- ============================================================================

create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references public.payment_attempts(id),
  -- null => an attempt-level refund (see record_payment_attempt_refund):
  -- money captured for a bucket that never became an order at all. Never
  -- null for a refund recorded via record_order_refund.
  order_id uuid references public.orders(id),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'EGP' check (currency = 'EGP'),
  provider_reference text not null check (btrim(provider_reference) <> ''),
  refund_type text not null check (refund_type in ('partial', 'full')),
  actor_id uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  unique (provider_reference)
);

create index if not exists payment_refunds_order_id_idx on public.payment_refunds (order_id) where order_id is not null;
create index if not exists payment_refunds_payment_attempt_id_idx on public.payment_refunds (payment_attempt_id);

alter table public.payment_refunds enable row level security;
revoke all on public.payment_refunds from public, anon, authenticated;
grant select, insert on public.payment_refunds to service_role;

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('unpaid', 'paid', 'partially_refunded', 'refunded'));

-- The captured/refundable balance for one order: the expected_amount_cents
-- of its own fulfilled bucket (private.payment_attempt_fulfillments), minus
-- whatever payment_refunds already records against it. Shared by
-- record_order_refund and (read-only) by anything else that needs to show
-- "how much of this order is still refundable".
create or replace function private.compute_order_refundable_balance_cents(p_order_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_expected integer;
  v_already_refunded integer;
begin
  select f.expected_amount_cents into v_expected
  from private.payment_attempt_fulfillments f
  where f.order_id = p_order_id and f.status = 'fulfilled';

  if v_expected is null then
    raise exception 'ORDER_HAS_NO_CAPTURED_AMOUNT';
  end if;

  select coalesce(sum(amount_cents), 0) into v_already_refunded
  from public.payment_refunds
  where order_id = p_order_id;

  return jsonb_build_object(
    'expectedAmountCents', v_expected,
    'alreadyRefundedCents', v_already_refunded,
    'remainingCents', v_expected - v_already_refunded
  );
end;
$$;

revoke all on function private.compute_order_refundable_balance_cents(uuid) from public, anon, authenticated;

create or replace function public.record_order_refund(
  p_order_id uuid,
  p_actor_id uuid,
  p_amount_cents integer,
  p_provider_reference text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_expected integer;
  v_already_refunded integer;
  v_new_total integer;
  v_refund_type text;
  v_existing record;
  v_id uuid;
begin
  if p_actor_id is null then raise exception 'ACTOR_REQUIRED'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if nullif(btrim(coalesce(p_provider_reference, '')), '') is null then
    raise exception 'PROVIDER_REFERENCE_REQUIRED';
  end if;

  select id, payment_method, payment_attempt_id, master_order_id, payment_status
  into v_order
  from public.orders
  where id = p_order_id
  for update;
  if v_order.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.payment_method = 'cash_on_delivery' or v_order.payment_attempt_id is null then
    raise exception 'ORDER_NOT_CARD_PAID';
  end if;

  select f.expected_amount_cents into v_expected
  from private.payment_attempt_fulfillments f
  where f.order_id = p_order_id and f.status = 'fulfilled';
  if v_expected is null then raise exception 'ORDER_HAS_NO_CAPTURED_AMOUNT'; end if;

  select coalesce(sum(amount_cents), 0) into v_already_refunded
  from public.payment_refunds
  where order_id = p_order_id;

  -- Idempotency: replaying the same provider reference for the same order
  -- and amount is a safe no-op; reusing it for a different order or amount
  -- is rejected outright rather than silently accepted.
  select id, order_id, amount_cents into v_existing
  from public.payment_refunds
  where provider_reference = p_provider_reference;
  if v_existing.id is not null then
    if v_existing.order_id = p_order_id and v_existing.amount_cents = p_amount_cents then
      return jsonb_build_object(
        'id', v_existing.id, 'order_id', p_order_id, 'replayed', true
      );
    end if;
    raise exception 'REFUND_REFERENCE_ALREADY_USED';
  end if;

  v_new_total := v_already_refunded + p_amount_cents;
  if v_new_total > v_expected then
    raise exception 'REFUND_EXCEEDS_CAPTURED_BALANCE: expected % have % requested %',
      v_expected, v_already_refunded, p_amount_cents;
  end if;

  v_refund_type := case when v_new_total >= v_expected then 'full' else 'partial' end;

  insert into public.payment_refunds (
    payment_attempt_id, order_id, amount_cents, provider_reference, refund_type, actor_id, note
  ) values (
    v_order.payment_attempt_id, p_order_id, p_amount_cents, p_provider_reference, v_refund_type, p_actor_id, p_note
  )
  returning id into v_id;

  update public.orders
  set payment_status = case when v_refund_type = 'full' then 'refunded' else 'partially_refunded' end
  where id = p_order_id;

  return jsonb_build_object(
    'id', v_id,
    'order_id', p_order_id,
    'refund_type', v_refund_type,
    'expected_amount_cents', v_expected,
    'total_refunded_cents', v_new_total,
    'remaining_cents', v_expected - v_new_total,
    'replayed', false
  );
end;
$$;

revoke all on function public.record_order_refund(uuid, uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.record_order_refund(uuid, uuid, integer, text, text) to service_role;

-- Successor to mark_payment_attempt_refund_recorded (dropped below), for
-- the ONLY case that function's actual callers ever need: a captured
-- attempt with at least one FAILED bucket, where the failed portion's
-- money was captured but never became an order (no order_id exists to
-- refund against via record_order_refund).
create or replace function public.record_payment_attempt_refund(
  p_payment_attempt_id uuid,
  p_actor_id uuid,
  p_amount_cents integer,
  p_provider_reference text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt record;
  v_refundable integer;
  v_already_refunded integer;
  v_new_total integer;
  v_id uuid;
  v_existing record;
begin
  if p_actor_id is null then raise exception 'ACTOR_REQUIRED'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if nullif(btrim(coalesce(p_provider_reference, '')), '') is null then
    raise exception 'PROVIDER_REFERENCE_REQUIRED';
  end if;

  select * into v_attempt from public.payment_attempts where id = p_payment_attempt_id for update;
  if v_attempt.id is null then raise exception 'PAYMENT_ATTEMPT_NOT_FOUND'; end if;

  if not exists (
    select 1 from private.payment_attempt_fulfillments f
    where f.payment_attempt_id = p_payment_attempt_id and f.status = 'failed'
  ) then
    raise exception 'NO_FAILED_BUCKET_TO_REFUND: use record_order_refund for a specific fulfilled order instead';
  end if;

  select coalesce(sum(f.expected_amount_cents), 0) into v_refundable
  from private.payment_attempt_fulfillments f
  where f.payment_attempt_id = p_payment_attempt_id and f.status = 'failed';

  select coalesce(sum(amount_cents), 0) into v_already_refunded
  from public.payment_refunds
  where payment_attempt_id = p_payment_attempt_id and order_id is null;

  select id, payment_attempt_id, amount_cents into v_existing
  from public.payment_refunds
  where provider_reference = p_provider_reference;
  if v_existing.id is not null then
    if v_existing.payment_attempt_id = p_payment_attempt_id and v_existing.order_id is null
       and v_existing.amount_cents = p_amount_cents then
      return jsonb_build_object('id', v_existing.id, 'payment_attempt_id', p_payment_attempt_id, 'replayed', true);
    end if;
    raise exception 'REFUND_REFERENCE_ALREADY_USED';
  end if;

  v_new_total := v_already_refunded + p_amount_cents;
  if v_new_total > v_refundable then
    raise exception 'REFUND_EXCEEDS_CAPTURED_BALANCE: refundable % have % requested %',
      v_refundable, v_already_refunded, p_amount_cents;
  end if;

  insert into public.payment_refunds (
    payment_attempt_id, order_id, amount_cents, provider_reference, refund_type, actor_id, note
  ) values (
    p_payment_attempt_id, null, p_amount_cents, p_provider_reference,
    case when v_new_total >= v_refundable then 'full' else 'partial' end,
    p_actor_id, p_note
  )
  returning id into v_id;

  if v_new_total >= v_refundable and v_attempt.refunded_at is null then
    update public.payment_attempts
    set refunded_at = now(), refund_note = p_note, refunded_by = p_actor_id, updated_at = now()
    where id = p_payment_attempt_id;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'payment_attempt_id', p_payment_attempt_id,
    'refundable_cents', v_refundable,
    'total_refunded_cents', v_new_total,
    'remaining_cents', v_refundable - v_new_total,
    'replayed', false
  );
end;
$$;

revoke all on function public.record_payment_attempt_refund(uuid, uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.record_payment_attempt_refund(uuid, uuid, integer, text, text) to service_role;

drop function if exists public.mark_payment_attempt_refund_recorded(uuid, uuid, text);

-- list_payment_attempts_needing_refund_review's refund_amount_cents now
-- subtracts whatever record_payment_attempt_refund has already recorded
-- against the failed-bucket balance, so a partial attempt-level refund
-- correctly shows what's still outstanding instead of the static original
-- figure forever.
create or replace function public.list_payment_attempts_needing_refund_review()
returns table (
  payment_attempt_id uuid,
  user_id uuid,
  status text,
  amount_cents integer,
  currency text,
  is_partial boolean,
  refund_amount_cents integer,
  refunded_at timestamptz,
  refund_note text,
  created_at timestamptz,
  paid_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pa.id,
    pa.user_id,
    pa.status,
    pa.amount_cents,
    pa.currency,
    exists (
      select 1 from private.payment_attempt_fulfillments f
      where f.payment_attempt_id = pa.id and f.status = 'fulfilled'
    ) and exists (
      select 1 from private.payment_attempt_fulfillments f
      where f.payment_attempt_id = pa.id and f.status = 'failed'
    ) as is_partial,
    greatest(
      coalesce(
        (
          select sum(f.expected_amount_cents)::int
          from private.payment_attempt_fulfillments f
          where f.payment_attempt_id = pa.id and f.status = 'failed'
        ),
        case when pa.status = 'fulfillment_failed' then pa.amount_cents else 0 end
      ) - coalesce(
        (
          select sum(pr.amount_cents)::int
          from public.payment_refunds pr
          where pr.payment_attempt_id = pa.id and pr.order_id is null
        ),
        0
      ),
      0
    ) as refund_amount_cents,
    pa.refunded_at,
    pa.refund_note,
    pa.created_at,
    pa.paid_at
  from public.payment_attempts pa
  where pa.status = 'fulfillment_failed'
     or (
       pa.status = 'fulfilled'
       and exists (
         select 1 from private.payment_attempt_fulfillments f
         where f.payment_attempt_id = pa.id and f.status = 'failed'
       )
     )
  order by pa.paid_at desc nulls last, pa.created_at desc;
$$;

revoke all on function public.list_payment_attempts_needing_refund_review() from public, anon, authenticated;
grant execute on function public.list_payment_attempts_needing_refund_review() to service_role;

-- cancel_order, combining this section's stricter payment-status gate
-- (blocks 'partially_refunded' too, not just 'paid' — a card order is not
-- cancellable until its refund reaches 'refunded', i.e. record_order_refund
-- has covered the full captured amount) with Section 4's controlled
-- archived-stock exemption (private.archived_stock_restoration_in_progress,
-- set only here, transaction-local, immediately before the restock UPDATE
-- — see Section 4's own comment for why this specific call site needs it).
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
  -- Corrective pass 2, Section 1: 'partially_refunded' is blocked too, not
  -- just 'paid' — a partial attested refund is not enough to release stock
  -- for resale while some of the captured amount is still owed back.
  if v_payment_method <> 'cash_on_delivery' and v_payment_status in ('paid', 'partially_refunded') then
    raise exception 'PAID_ORDER_REQUIRES_REFUND_REVIEW';
  end if;

  -- Corrective pass 2, Section 4: order-cancellation restock is one of the
  -- few legitimate reasons product_variants.quantity may increase for a
  -- Variant whose parent product has since been archived (see
  -- private.enforce_archived_product_variant_stock_guard) — the product can
  -- be archived while it still has open orders (compute_product_deletion_
  -- eligibility's canArchive does not require zero open orders), and
  -- cancelling one of those orders afterward must still be able to restore
  -- the stock it's returning. Transaction-local (set_config's third
  -- argument), so it can never leak into another statement or another
  -- transaction, and it is set only here — never client-settable, since
  -- clients only ever reach this through the cancel_order RPC call itself.
  perform pg_catalog.set_config('private.archived_stock_restoration_in_progress', 'on', true);

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


-- ============================================================================
-- SECTION 3 — Atomic account deletion versus payment-attempt creation
-- ============================================================================
-- app/api/account/delete/route.ts used to SELECT for open payment attempts,
-- then separately call queueAccountStorageCleanup/auth.admin.deleteUser —
-- classic time-of-check/time-of-use: a card checkout could create a fresh
-- payment_attempt in the gap between the check and the actual deletion.
--
-- Fixed with a single row lock both sides serialize on: profiles.id (the
-- same row every other identity-scoped write in this schema already keys
-- off). lock_account_for_deletion() takes `for update` on that row, checks
-- for open attempts UNDER that lock, and only then stamps
-- pending_deletion_locked_at; create_payment_attempt() (redefined below)
-- takes the SAME `for update` lock on the SAME row, early, before doing any
-- other work, and refuses to proceed while that stamp is set (and not
-- stale). Whichever transaction acquires the row lock first commits with
-- an outcome the other transaction is guaranteed to see once it acquires
-- the lock afterward — there is no window where both read a state that's
-- already stale by the time they act on it.
--
-- pending_deletion_locked_at is a plain timestamp, not a boolean: a lock
-- older than 10 minutes is treated as abandoned (the deletion attempt
-- crashed or errored between locking and either completing or explicitly
-- unlocking) and ignored by create_payment_attempt, so a failed deletion
-- can never permanently strand an account unable to pay. The route also
-- explicitly calls unlock_account_for_deletion() on every failure path as
-- the primary release mechanism; the 10-minute staleness window is the
-- fallback for a crash that skips even that.
-- ============================================================================

alter table public.profiles add column if not exists pending_deletion_locked_at timestamptz;

create or replace function public.lock_account_for_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open_count integer;
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  select count(*) into v_open_count
  from public.payment_attempts
  where user_id = p_user_id
    and status in ('created', 'pending', 'processing', 'paid', 'reflecting');

  if v_open_count > 0 then
    raise exception 'PAYMENT_ATTEMPT_IN_PROGRESS';
  end if;

  update public.profiles
  set pending_deletion_locked_at = now()
  where id = p_user_id;

  return jsonb_build_object('user_id', p_user_id, 'locked_at', now());
end;
$$;

revoke all on function public.lock_account_for_deletion(uuid) from public, anon, authenticated;
grant execute on function public.lock_account_for_deletion(uuid) to service_role;

create or replace function public.unlock_account_for_deletion(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set pending_deletion_locked_at = null where id = p_user_id;
$$;

revoke all on function public.unlock_account_for_deletion(uuid) from public, anon, authenticated;
grant execute on function public.unlock_account_for_deletion(uuid) to service_role;

-- Preserves the accounting-relevant part of every payment_attempts row
-- this user ever created (cart_snapshot: product ids/prices/quantities —
-- no customer PII), while destroying the personal data inside
-- shipping_snapshot (name/email/phone/address/city/governorate). Must run
-- BEFORE auth.admin.deleteUser() — payment_attempts.user_id becomes NULL
-- the moment the auth user is actually gone (ON DELETE SET NULL, see
-- 20260820000001's PAY-02 fix), which would make these rows impossible to
-- find by user_id afterward.
create or replace function public.redact_deleted_account_payment_snapshots(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.payment_attempts
  set shipping_snapshot = jsonb_build_object('redacted', true, 'redacted_at', now())
  where user_id = p_user_id
    and shipping_snapshot is not null
    and shipping_snapshot -> 'redacted' is distinct from 'true'::jsonb;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.redact_deleted_account_payment_snapshots(uuid) from public, anon, authenticated;
grant execute on function public.redact_deleted_account_payment_snapshots(uuid) to service_role;

-- create_payment_attempt, reproduced from 20260820000001's version with
-- exactly one addition: a `for update` lock + staleness-bounded check on
-- profiles.pending_deletion_locked_at, placed right after the idempotency
-- replay short-circuit (a replay creates nothing new, so it is allowed to
-- proceed even mid-deletion) and before any other work — see this
-- section's own header comment for why this specific lock closes the
-- account-deletion race. Every other line, including the PAY-06 coupon
-- reservation logic, is unchanged.
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
  v_deletion_locked_at timestamptz;
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

  -- Corrective pass 2, Section 3: locks the SAME profiles row
  -- lock_account_for_deletion() locks, so a concurrent account-deletion
  -- request and a concurrent payment-attempt creation for the same user
  -- can never both see a stale "safe to proceed" state — whichever
  -- transaction gets here first is what the other one's lock wait exposes
  -- it to. A lock older than 10 minutes is treated as an abandoned/crashed
  -- deletion attempt, not a real block.
  select pending_deletion_locked_at into v_deletion_locked_at
  from public.profiles where id = p_user_id for update;
  if not found then raise exception 'INVALID_USER'; end if;
  if v_deletion_locked_at is not null and v_deletion_locked_at > pg_catalog.now() - interval '10 minutes' then
    raise exception 'ACCOUNT_DELETION_IN_PROGRESS';
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


-- ============================================================================
-- SECTION 4 — Archived-product inventory behavior: an explicit, auditable
-- transition matrix instead of a blanket "block every increase" rule.
-- ============================================================================
-- 20260820000001's private.enforce_archived_product_variant_stock_guard
-- blocked EVERY increase to product_variants.quantity/brand_stock_quantity
-- once the parent product was Archived — correct for the two entry points
-- PROD-02 actually named (apply_inventory_adjustments,
-- request_warehouse_transfer), but it also silently broke every legitimate
-- restoration path that never touches either of those two functions:
-- cancel_order's restock, private.post_warehouse_correction's
-- 'reclassify'/'restore_to_sellable' legs, and resolve_warehouse_
-- quarantine's 'restored_to_sellable'/'returned_to_brand' resolutions.
--
-- Rather than hand-edit apply_inventory_adjustments/request_warehouse_
-- transfer (the two large, already-audited functions the first pass
-- deliberately avoided retyping — that risk assessment was correct and
-- still holds), the trigger itself gains ONE additional, narrow escape
-- hatch: a transaction-local session setting,
-- private.archived_stock_restoration_in_progress, that the trigger treats
-- as "this specific increase is a known-legitimate restoration, not a new
-- acquisition of sellable stock". It is set with set_config(..., true)
-- (transaction-local — Postgres clears it automatically at COMMIT or
-- ROLLBACK, so it can never leak into an unrelated statement or a later
-- transaction on the same pooled connection) and ONLY inside the three
-- canonical SECURITY DEFINER functions below, each immediately before its
-- own qualifying UPDATE — never exposed to any client-settable input, and
-- never left set for longer than the single statement that needs it.
-- apply_inventory_adjustments and request_warehouse_transfer are
-- deliberately NOT given this exemption: an admin/brand direct stock
-- adjustment and a brand-initiated NEW inbound warehouse request are
-- exactly the two acquisition paths PROD-02 was written to close, so they
-- correctly keep failing shut for an Archived product, with zero changes
-- to either function's body.
--
-- activate_fulfillment_mode_transition/cancel_fulfillment_transition
-- (brand_stock_quantity -> quantity reclassification on a brand's
-- self-fulfillment <-> Zakhnook-pool switch) are also deliberately NOT
-- exempted: turning previously brand-held, not-sellable-through-Zakhnook
-- stock into sellable quantity is exactly the kind of quiet second
-- sellable-stock entry point PROD-02 was written to close, so an Archived
-- product's stock correctly stays blocked from that path too.
-- ============================================================================

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
  if pg_catalog.current_setting('private.archived_stock_restoration_in_progress', true) = 'on' then
    return new;
  end if;
  select status into v_product_status from public.products where id = new.product_id;
  if v_product_status = 'archived' then
    raise exception 'PRODUCT_ARCHIVED_CANNOT_ACQUIRE_STOCK';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_archived_product_variant_stock_guard() from public, anon, authenticated;

-- private.post_warehouse_correction, reproduced verbatim from
-- 20260817192829_warehouse_receipts_and_corrections.sql with exactly one
-- addition: the transaction-local exemption set immediately before the
-- 'reclassify' / 'adjust_in' / 'restore_to_sellable' leg's UPDATE (the
-- INCREASE leg — the 'reclassify' / 'adjust_out' DECREASE leg earlier in
-- the same loop needs no exemption, since a decrease is already always
-- allowed by the trigger's own early-return). Every other line is
-- unchanged.
create or replace function private.post_warehouse_correction(
  p_correction_id uuid,
  p_approver_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correction record;
  v_transfer record;
  v_line record;
  v_from record;
  v_to record;
  v_previous integer;
  v_new integer;
  v_is_opening_stock boolean;
  v_source_receipt_line record;
  v_damage_resolved integer;
  v_missing_resolved integer;
  v_substitution_resolved integer;
  v_excess_resolved integer;
  v_unidentified_resolved integer;
  v_results jsonb := '[]'::jsonb;
begin
  select wc.id, wc.transfer_id, wc.status, wc.requested_by, wc.correction_number,
         wc.reverses_correction_id
  into v_correction
  from public.warehouse_corrections wc
  where wc.id = p_correction_id;
  if v_correction.id is null then raise exception 'CORRECTION_NOT_FOUND'; end if;

  select id, brand_id into v_transfer
  from public.warehouse_transfers
  where id = v_correction.transfer_id;
  if v_transfer.id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;

  perform 1 from public.brands where id = v_transfer.brand_id for update;
  perform 1 from public.warehouse_transfers where id = v_transfer.id for update;

  select wc.id, wc.transfer_id, wc.status, wc.requested_by, wc.correction_number,
         wc.reverses_correction_id
  into v_correction
  from public.warehouse_corrections wc
  where wc.id = p_correction_id
  for update;

  if v_correction.status = 'posted' then
    return jsonb_build_object('correctionId', v_correction.id, 'correctionNumber', v_correction.correction_number, 'replayed', true);
  end if;
  if v_correction.status <> 'pending_approval' then raise exception 'CORRECTION_NOT_PENDING'; end if;
  if v_correction.requested_by = p_approver_id then raise exception 'CORRECTION_REQUIRES_INDEPENDENT_APPROVER'; end if;

  perform 1
  from public.product_variants pv
  where pv.id in (
    select from_variant_id from public.warehouse_correction_lines where correction_id = p_correction_id
    union
    select to_variant_id from public.warehouse_correction_lines where correction_id = p_correction_id
  )
  order by pv.id
  for update;

  for v_line in
    select *
    from public.warehouse_correction_lines
    where correction_id = p_correction_id
    order by id
  loop
    select null::uuid as id, null::integer as quantity,
           null::text as product_id, null::uuid as brand_id
    into v_from;
    select null::uuid as id, null::integer as quantity,
           null::text as product_id,
           null::timestamptz as opening_stock_recognized_at,
           null::boolean as is_archived, null::text as selling_status,
           null::uuid as brand_id
    into v_to;

    if v_line.from_variant_id is not null then
      select pv.id, pv.quantity, pv.product_id, p.brand_id
      into v_from
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      where pv.id = v_line.from_variant_id;
      if v_from.id is null or v_from.brand_id <> v_transfer.brand_id then raise exception 'CORRECTION_VARIANT_BRAND_MISMATCH'; end if;
    end if;

    if v_line.to_variant_id is not null then
      select pv.id, pv.quantity, pv.product_id, pv.opening_stock_recognized_at,
             pv.is_archived, pv.selling_status, p.brand_id
      into v_to
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      where pv.id = v_line.to_variant_id;
      if v_to.id is null or v_to.brand_id <> v_transfer.brand_id then raise exception 'CORRECTION_VARIANT_BRAND_MISMATCH'; end if;
      if v_to.is_archived or v_to.selling_status <> 'active' then raise exception 'CORRECTION_TARGET_VARIANT_NOT_ACTIVE'; end if;
    end if;

    if v_line.action in ('reclassify', 'adjust_out') then
      if v_from.quantity < v_line.quantity then raise exception 'CORRECTION_WOULD_GO_NEGATIVE'; end if;
      v_previous := v_from.quantity;
      v_new := v_previous - v_line.quantity;
      update public.product_variants set quantity = v_new, updated_at = now() where id = v_from.id;
      insert into public.inventory_movements (
        variant_id, product_id, brand_id, previous_quantity, quantity_delta,
        new_quantity, movement_type, reason, note, created_by, source,
        source_operation_key, from_location, to_location,
        related_entity_type, related_entity_id
      ) values (
        v_from.id, v_from.product_id, v_transfer.brand_id, v_previous,
        -v_line.quantity, v_new,
        case when v_line.action = 'reclassify' then 'warehouse_reclassification_out' else 'warehouse_correction_adjustment' end,
        'Warehouse correction ' || v_correction.correction_number,
        nullif(pg_catalog.btrim(v_line.note), ''), p_approver_id,
        'warehouse_correction',
        'warehouse-correction:' || p_correction_id::text || ':' || v_line.id::text || ':out',
        'zakhnook_available', 'sold_or_removed',
        'warehouse_correction', p_correction_id
      );
    end if;

    if v_line.action in ('reclassify', 'adjust_in', 'restore_to_sellable') then
      -- Re-read after a possible out leg in case both legs touch rows that
      -- were locked together but changed earlier in this correction.
      select pv.id, pv.quantity, pv.product_id, pv.opening_stock_recognized_at
      into v_to
      from public.product_variants pv where pv.id = v_line.to_variant_id;
      v_previous := v_to.quantity;
      v_new := v_previous + v_line.quantity;
      v_is_opening_stock := v_previous = 0 and v_new > 0 and v_to.opening_stock_recognized_at is null;

      -- Corrective pass 2, Section 4: this is a warehouse correction posting
      -- an already-approved reclassification/restore-to-sellable leg, one
      -- of the explicitly named "must not fail unexpectedly" cases — never
      -- a new acquisition of stock.
      perform pg_catalog.set_config('private.archived_stock_restoration_in_progress', 'on', true);

      update public.product_variants
      set quantity = v_new,
          opening_stock_recognized_at = case when v_is_opening_stock then coalesce(opening_stock_recognized_at, now()) else opening_stock_recognized_at end,
          opening_stock_recognition_source = case when v_is_opening_stock then coalesce(opening_stock_recognition_source, 'warehouse_receipt') else opening_stock_recognition_source end,
          updated_at = now()
      where id = v_to.id;

      update public.products set first_stocked_at = coalesce(first_stocked_at, now()) where id = v_to.product_id;
      perform private.stamp_product_first_visible_if_eligible(v_to.product_id);

      insert into public.inventory_movements (
        variant_id, product_id, brand_id, previous_quantity, quantity_delta,
        new_quantity, movement_type, reason, note, created_by, source,
        source_operation_key, from_location, to_location,
        related_entity_type, related_entity_id, is_opening_stock
      ) values (
        v_to.id, v_to.product_id, v_transfer.brand_id, v_previous,
        v_line.quantity, v_new,
        case
          when v_line.action = 'reclassify' then 'warehouse_reclassification_in'
          when v_line.action = 'restore_to_sellable' then 'warehouse_discrepancy_resolution'
          else 'warehouse_correction_adjustment'
        end,
        'Warehouse correction ' || v_correction.correction_number,
        nullif(pg_catalog.btrim(v_line.note), ''), p_approver_id,
        'warehouse_correction',
        'warehouse-correction:' || p_correction_id::text || ':' || v_line.id::text || ':in',
        case when v_line.action = 'restore_to_sellable' then 'zakhnook_quarantine' else null end,
        'zakhnook_available', 'warehouse_correction', p_correction_id,
        v_is_opening_stock
      );
    end if;

    if v_line.action in ('return_to_brand', 'write_off') then
      insert into public.inventory_movements (
        variant_id, product_id, brand_id, previous_quantity, quantity_delta,
        new_quantity, movement_type, reason, note, created_by, source,
        source_operation_key, from_location, to_location,
        related_entity_type, related_entity_id
      ) values (
        v_from.id, v_from.product_id, v_transfer.brand_id,
        v_from.quantity, 0, v_from.quantity,
        'warehouse_discrepancy_resolution',
        case when v_line.action = 'return_to_brand' then 'Damaged stock returned to brand' else 'Damaged stock written off' end,
        nullif(pg_catalog.btrim(v_line.note), ''), p_approver_id,
        'warehouse_correction',
        'warehouse-correction:' || p_correction_id::text || ':' || v_line.id::text || ':disposition',
        'zakhnook_quarantine',
        case when v_line.action = 'return_to_brand' then 'returned_to_brand' else 'sold_or_removed' end,
        'warehouse_correction', p_correction_id
      );

      if v_line.action = 'return_to_brand' then
        -- Corrective pass 2, Section 4: same reasoning as the reclassify/
        -- restore_to_sellable leg above — this credits brand_stock_quantity
        -- as part of an already-approved correction disposition, not a new
        -- acquisition.
        perform pg_catalog.set_config('private.archived_stock_restoration_in_progress', 'on', true);
        update public.product_variants
        set brand_stock_quantity = brand_stock_quantity + v_line.quantity,
            updated_at = now()
        where id = v_from.id;
      end if;
    end if;

    if v_line.source_receipt_line_id is not null then
      select actual_damaged_qty, expected_missing_qty, actual_good_qty,
             actual_excess_qty, unidentified_qty, expected_variant_id,
             actual_variant_id
      into v_source_receipt_line
      from public.warehouse_receipt_lines
      where id = v_line.source_receipt_line_id;

      select
        coalesce(sum(wcl.quantity) filter (where wcl.source_bucket = 'damaged'), 0),
        coalesce(sum(wcl.quantity) filter (where wcl.source_bucket = 'missing'), 0),
        coalesce(sum(wcl.quantity) filter (where wcl.source_bucket = 'substitution'), 0),
        coalesce(sum(wcl.quantity) filter (where wcl.source_bucket = 'excess'), 0),
        coalesce(sum(wcl.quantity) filter (where wcl.source_bucket = 'unidentified'), 0)
      into v_damage_resolved, v_missing_resolved, v_substitution_resolved,
           v_excess_resolved, v_unidentified_resolved
      from public.warehouse_correction_lines wcl
      join public.warehouse_corrections wc on wc.id = wcl.correction_id
      where wcl.source_receipt_line_id = v_line.source_receipt_line_id
        and (wc.status = 'posted' or wc.id = p_correction_id);

      update public.warehouse_receipt_lines
      set settlement_status = case
        when v_damage_resolved >= v_source_receipt_line.actual_damaged_qty
          and v_missing_resolved + v_substitution_resolved
            >= v_source_receipt_line.expected_missing_qty
          and v_substitution_resolved >= case
            when v_source_receipt_line.actual_variant_id is distinct from v_source_receipt_line.expected_variant_id
              then v_source_receipt_line.actual_good_qty
            else 0
          end
          and v_excess_resolved >= v_source_receipt_line.actual_excess_qty
          and v_unidentified_resolved >= v_source_receipt_line.unidentified_qty
          then 'settled'
        when v_damage_resolved > 0 or v_missing_resolved > 0
          or v_substitution_resolved > 0 or v_excess_resolved > 0
          or v_unidentified_resolved > 0
          then 'partially_settled'
        else settlement_status
      end
      where id = v_line.source_receipt_line_id;
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'lineId', v_line.id,
      'action', v_line.action,
      'quantity', v_line.quantity,
      'fromVariantId', v_line.from_variant_id,
      'toVariantId', v_line.to_variant_id
    ));
  end loop;

  update public.warehouse_corrections
  set status = 'posted', approved_by = p_approver_id,
      approved_at = now(), posted_at = now()
  where id = p_correction_id;

  if v_correction.reverses_correction_id is not null then
    update public.warehouse_corrections
    set status = 'reversed'
    where id = v_correction.reverses_correction_id
      and status = 'posted';
  end if;

  update public.warehouse_receipts wr
  set settlement_status = case
    when exists (
      select 1 from public.warehouse_receipt_lines wrl
      where wrl.receipt_id = wr.id and wrl.settlement_status = 'partially_settled'
    ) then 'partially_settled'
    when exists (
      select 1 from public.warehouse_receipt_lines wrl
      where wrl.receipt_id = wr.id and wrl.settlement_status = 'open'
    ) then 'open_discrepancy'
    when exists (
      select 1 from public.warehouse_receipt_lines wrl
      where wrl.receipt_id = wr.id and wrl.settlement_status in ('settled', 'corrected')
    ) then 'settled'
    else wr.settlement_status
  end
  where wr.transfer_id = v_transfer.id
    and exists (
      select 1
      from public.warehouse_correction_lines wcl
      join public.warehouse_receipt_lines wrl on wrl.id = wcl.source_receipt_line_id
      where wcl.correction_id = p_correction_id and wrl.receipt_id = wr.id
    );

  update public.warehouse_transfers
  set reconciliation_status = case
        when exists (
          select 1
          from public.warehouse_receipts wr
          where wr.transfer_id = v_transfer.id
            and wr.settlement_status in ('open_discrepancy', 'partially_settled')
        ) then 'partially_settled'
        else 'corrected'
      end,
      updated_at = now()
  where id = v_transfer.id;

  return jsonb_build_object(
    'correctionId', v_correction.id,
    'correctionNumber', v_correction.correction_number,
    'status', 'posted',
    'lines', v_results,
    'replayed', false
  );
end;
$$;

revoke all on function private.post_warehouse_correction(uuid, uuid)
  from public, anon, authenticated, service_role;

-- public.resolve_warehouse_quarantine, reproduced verbatim from
-- 20260814000003_warehouse_documents.sql with exactly one addition: the
-- same transaction-local exemption, set once before either the
-- 'returned_to_brand' (brand_stock_quantity credit) or 'restored_to_
-- sellable' (quantity credit) branch — both are quarantine-resolution
-- outcomes for stock the warehouse already physically holds, not a new
-- acquisition. The 'written_off' branch needs no exemption (it never
-- touches product_variants at all).
create or replace function public.resolve_warehouse_quarantine(
  p_transfer_item_id uuid,
  p_actor_id uuid,
  p_resolution text,
  p_note text,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_variant record;
  v_transfer record;
  v_quarantine_qty integer;
  v_existing_movement record;
begin
  if p_resolution not in ('written_off', 'returned_to_brand', 'restored_to_sellable') then
    raise exception 'INVALID_QUARANTINE_RESOLUTION';
  end if;
  if nullif(pg_catalog.btrim(p_operation_key), '') is null or length(p_operation_key) > 160 then
    raise exception 'INVALID_OPERATION_KEY';
  end if;
  if nullif(pg_catalog.btrim(p_note), '') is null then
    raise exception 'QUARANTINE_RESOLUTION_NOTE_REQUIRED';
  end if;

  -- Serialize this operation key globally. Different transfer items lock
  -- different rows, so an item-row lock alone cannot prevent concurrent
  -- reuse of the same idempotency key on two separate items.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('warehouse_quarantine:' || p_operation_key, 0)
  );

  select id, variant_id, transfer_id, damaged_qty, missing_qty, quarantine_resolved_at, quarantine_resolution into v_item
  from public.warehouse_transfer_items
  where id = p_transfer_item_id
  for update;
  if v_item.id is null then raise exception 'TRANSFER_ITEM_NOT_FOUND'; end if;

  -- Replay validation FIRST — before the already-resolved check, so a
  -- genuine retry of a call that already succeeded returns replayed:true
  -- rather than erroring, even though the item is now marked resolved.
  select variant_id, related_entity_id, reason into v_existing_movement
  from public.inventory_movements
  where source_operation_key = p_operation_key
    and movement_type = 'warehouse_quarantine_release'
  limit 1;

  if v_existing_movement.variant_id is not null then
    if v_existing_movement.related_entity_id = p_transfer_item_id and v_item.quarantine_resolution = p_resolution then
      return jsonb_build_object('transfer_item_id', v_item.id, 'resolution', p_resolution, 'replayed', true);
    end if;
    -- Same operation_key reused against a different transfer item, or
    -- against the same item but claiming a different resolution than what
    -- actually got recorded — never treated as a safe replay.
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  if v_item.quarantine_resolved_at is not null then raise exception 'QUARANTINE_ALREADY_RESOLVED'; end if;

  v_quarantine_qty := coalesce(v_item.damaged_qty, 0) + coalesce(v_item.missing_qty, 0);
  if v_quarantine_qty <= 0 then raise exception 'NO_UNRESOLVED_QUARANTINE_QUANTITY'; end if;

  select id, brand_id into v_transfer from public.warehouse_transfers where id = v_item.transfer_id;
  select id, quantity, product_id, brand_stock_quantity into v_variant
  from public.product_variants where id = v_item.variant_id for update;

  -- Corrective pass 2, Section 4: both resolution outcomes below are
  -- explicitly named "must not fail unexpectedly" cases — never a new
  -- acquisition of stock.
  perform pg_catalog.set_config('private.archived_stock_restoration_in_progress', 'on', true);

  if p_resolution = 'returned_to_brand' then
    update public.product_variants
    set brand_stock_quantity = brand_stock_quantity + v_quarantine_qty, updated_at = now()
    where id = v_variant.id;
    insert into public.inventory_movements (
      variant_id, product_id, brand_id, previous_quantity, quantity_delta, new_quantity,
      movement_type, reason, note, created_by, source, source_operation_key,
      from_location, to_location, related_entity_type, related_entity_id
    ) values (
      v_variant.id, v_variant.product_id, v_transfer.brand_id, 0, 0, 0,
      'warehouse_quarantine_release', 'Quarantine resolved: returned to brand',
      nullif(pg_catalog.btrim(p_note), ''), p_actor_id, 'warehouse_transfer', p_operation_key,
      'zakhnook_quarantine', 'returned_to_brand', 'warehouse_document', v_item.id
    );
  elsif p_resolution = 'restored_to_sellable' then
    update public.product_variants
    set quantity = quantity + v_quarantine_qty, updated_at = now()
    where id = v_variant.id;
    insert into public.inventory_movements (
      variant_id, product_id, brand_id, previous_quantity, quantity_delta, new_quantity,
      movement_type, reason, note, created_by, source, source_operation_key,
      from_location, to_location, related_entity_type, related_entity_id
    ) values (
      v_variant.id, v_variant.product_id, v_transfer.brand_id, v_variant.quantity, v_quarantine_qty,
      v_variant.quantity + v_quarantine_qty,
      'warehouse_quarantine_release', 'Quarantine resolved: restored to sellable stock',
      nullif(pg_catalog.btrim(p_note), ''), p_actor_id, 'warehouse_transfer', p_operation_key,
      'zakhnook_quarantine', 'zakhnook_available', 'warehouse_document', v_item.id
    );
  else
    insert into public.inventory_movements (
      variant_id, product_id, brand_id, previous_quantity, quantity_delta, new_quantity,
      movement_type, reason, note, created_by, source, source_operation_key,
      from_location, to_location, related_entity_type, related_entity_id
    ) values (
      v_variant.id, v_variant.product_id, v_transfer.brand_id, 0, 0, 0,
      'warehouse_quarantine_release', 'Quarantine resolved: written off',
      nullif(pg_catalog.btrim(p_note), ''), p_actor_id, 'warehouse_transfer', p_operation_key,
      'zakhnook_quarantine', 'sold_or_removed', 'warehouse_document', v_item.id
    );
  end if;

  update public.warehouse_transfer_items
  set quarantine_resolved_at = now(), quarantine_resolved_by = p_actor_id, quarantine_resolution = p_resolution
  where id = p_transfer_item_id;

  return jsonb_build_object('transfer_item_id', p_transfer_item_id, 'resolution', p_resolution, 'replayed', false);
end;
$$;

revoke all on function public.resolve_warehouse_quarantine(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_warehouse_quarantine(uuid, uuid, text, text, text)
  to service_role;


-- ============================================================================
-- SECTION 5 — Coupon reservation invariant: one canonical max-usage check
-- for both COD and card, plus a backfill and card's own missing redemption.
-- ============================================================================
-- Two gaps survived the first pass:
--
--   1. private.coupon_reservations only existed going forward from the
--      moment 20260820000001 would have been applied — any payment_attempt
--      already sitting in a non-terminal status at that point (created
--      before the reservation ledger existed) would never get a row,
--      silently under-counting active reservations for that coupon code
--      until that specific attempt reached a terminal state on its own.
--      Backfilled below, once, idempotently (ON CONFLICT DO NOTHING keyed
--      by the ledger's own payment_attempt_id unique constraint).
--
--   2. The reservation ledger only ever protected card-vs-card concurrency
--      (create_payment_attempt's own check). Nothing taught COD's
--      place_order to see outstanding card reservations, and — a deeper
--      gap the first pass's own comments got wrong — card checkout never
--      incremented coupons.used_count AT ALL on success: place_paid_order
--      does not touch coupons in any way, and neither did anything else.
--      A successfully fulfilled card order's coupon use was invisible to
--      every future max_uses check forever, card or COD.
--
-- Both are closed WITHOUT touching place_order or place_paid_order (both
-- large, already-audited functions this pass continues to avoid hand-
-- editing) via a single universal guard at the actual point of truth: a
-- BEFORE UPDATE OF used_count trigger on coupons itself. Every current and
-- future used_count increment — COD's place_order, and the new
-- finalize_payment_attempt_coupon_redemption below for card — passes
-- through this ONE check, which additionally counts active card
-- reservations against max_uses. This is a universal trigger where PROD-02's
-- was not, because there is no legitimate reason used_count should ever be
-- allowed to exceed max_uses accounting for what's still reserved — unlike
-- product_variants.quantity, every increment here really is "one more
-- redemption claimed", so there are no exemption cases to carve out.
-- ============================================================================

insert into private.coupon_reservations (coupon_code, payment_attempt_id)
select nullif(pa.coupon_snapshot ->> 'code', ''), pa.id
from public.payment_attempts pa
where pa.status in ('created', 'pending', 'processing', 'paid', 'reflecting')
  and nullif(pa.coupon_snapshot ->> 'code', '') is not null
on conflict (payment_attempt_id) do nothing;

create or replace function private.enforce_coupon_max_uses_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_active_reservations integer;
begin
  if new.used_count <= old.used_count then
    return new;
  end if;
  if new.max_uses is null then
    return new;
  end if;

  select count(*) into v_active_reservations
  from private.coupon_reservations cr
  join public.payment_attempts pa on pa.id = cr.payment_attempt_id
  where cr.coupon_code = new.code
    and pa.status in ('created', 'pending', 'processing', 'paid', 'reflecting');

  if new.used_count + v_active_reservations > new.max_uses then
    raise exception 'COUPON_LIMIT_REACHED';
  end if;
  return new;
end;
$$;

drop trigger if exists coupons_enforce_max_uses_guard on public.coupons;
create trigger coupons_enforce_max_uses_guard
before update of used_count on public.coupons
for each row execute function private.enforce_coupon_max_uses_guard();

revoke all on function private.enforce_coupon_max_uses_guard() from public, anon, authenticated;

-- Card's missing counterpart to place_order's synchronous "increment
-- used_count + insert coupon_redemptions" — called from the Paymob webhook
-- route immediately after place_paid_order() reports status = 'fulfilled'
-- (see app/api/payments/paymob/webhook/route.ts). Idempotent: a payment
-- attempt with no reservation (no coupon was ever applied), one already
-- converted into a redemption, or one not yet fulfilled, is a safe no-op.
-- Deleting the reservation row and incrementing used_count happen in the
-- same statement sequence as this function's own transaction, so the
-- coupons_enforce_max_uses_guard trigger above never double-counts this
-- specific reservation against the increment that is, semantically,
-- converting it into a permanent redemption.
create or replace function public.finalize_payment_attempt_coupon_redemption(p_payment_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt record;
  v_reservation record;
  v_already_redeemed boolean;
begin
  select id, status, order_group_id into v_attempt
  from public.payment_attempts where id = p_payment_attempt_id for update;
  if v_attempt.id is null then raise exception 'PAYMENT_ATTEMPT_NOT_FOUND'; end if;

  select * into v_reservation
  from private.coupon_reservations
  where payment_attempt_id = p_payment_attempt_id;
  if v_reservation.id is null then
    return jsonb_build_object('payment_attempt_id', p_payment_attempt_id, 'redeemed', false, 'reason', 'NO_COUPON_RESERVATION');
  end if;

  if v_attempt.status <> 'fulfilled' or v_attempt.order_group_id is null then
    return jsonb_build_object('payment_attempt_id', p_payment_attempt_id, 'redeemed', false, 'reason', 'ATTEMPT_NOT_FULFILLED');
  end if;

  select exists(
    select 1 from private.coupon_redemptions where master_order_id = v_attempt.order_group_id
  ) into v_already_redeemed;
  if v_already_redeemed then
    delete from private.coupon_reservations where payment_attempt_id = p_payment_attempt_id;
    return jsonb_build_object('payment_attempt_id', p_payment_attempt_id, 'redeemed', true, 'reason', 'ALREADY_REDEEMED', 'replayed', true);
  end if;

  perform 1 from public.coupons where code = v_reservation.coupon_code for update;
  delete from private.coupon_reservations where payment_attempt_id = p_payment_attempt_id;
  update public.coupons set used_count = used_count + 1 where code = v_reservation.coupon_code;
  insert into private.coupon_redemptions (master_order_id, coupon_code)
  values (v_attempt.order_group_id, v_reservation.coupon_code);

  return jsonb_build_object(
    'payment_attempt_id', p_payment_attempt_id, 'redeemed', true, 'coupon_code', v_reservation.coupon_code, 'replayed', false
  );
end;
$$;

revoke all on function public.finalize_payment_attempt_coupon_redemption(uuid) from public, anon, authenticated;
grant execute on function public.finalize_payment_attempt_coupon_redemption(uuid) to service_role;


-- ============================================================================
-- SECTION 7 — Transactional application-deletion audit
-- ============================================================================
-- 20260820000001's admin_delete_brand_application accepted p_actor_id and
-- validated p_reason, then never persisted either anywhere in the
-- database — the durable audit_logs row was left to the app layer, written
-- from Node AFTER this RPC's transaction had already committed. A crash in
-- that gap left an application permanently deleted with zero durable
-- record of who did it or why, despite a reason being required at the API
-- boundary.
--
-- Fixed by moving the audit_logs insert INSIDE this function's own
-- transaction, before the deletes: if the audit row cannot be written (a
-- constraint violation, audit_logs unexpectedly missing, etc.), the whole
-- exception propagates and the entire deletion rolls back with it — the
-- application is never destroyed without a durable trail of who deleted it
-- and why. before_value is a curated, explicitly safe snapshot (brand
-- name/status/category/country/city/applicant id/submission date) —
-- deliberately NOT a raw to_jsonb(v_application) dump, which would carry
-- the applicant's email, phone, and legal registration numbers straight
-- into audit_logs. app/api/admin/applications/[id]/route.ts's DELETE
-- handler no longer calls logAudit() (which would otherwise create a
-- second, redundant row) — it now only sends the Discord mirror, best-
-- effort, after this RPC has already committed, exactly as intended for
-- external notifications.
-- ============================================================================

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
  v_actor_label text;
  v_safe_before jsonb;
  v_audit_id uuid;
begin
  if p_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'ACTOR_REQUIRED', 'message', 'An actor is required to delete an application.');
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED', 'message', 'A reason is required to delete an application.');
  end if;

  select * into v_application from public.brand_applications where id = p_application_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'APPLICATION_NOT_FOUND', 'message', 'This application no longer exists.');
  end if;

  select email into v_actor_label from public.profiles where id = p_actor_id;
  v_actor_label := coalesce(v_actor_label, p_actor_id::text);

  -- Queue every document's Storage object for durable cleanup BEFORE the
  -- metadata row that's the only record of its path is deleted below —
  -- still the same transaction, so this cannot partially apply.
  insert into public.storage_cleanup_jobs (owner_user_id, bucket_id, storage_path)
  select v_application.applicant_user_id, 'brand-application-documents', storage_path
  from public.brand_application_documents
  where application_id = p_application_id
  on conflict (bucket_id, storage_path) do nothing;
  get diagnostics v_queued = row_count;

  v_safe_before := jsonb_build_object(
    'id', v_application.id,
    'brandName', v_application.brand_name,
    'status', v_application.status,
    'applicantUserId', v_application.applicant_user_id,
    'productCategory', v_application.product_category,
    'country', v_application.country,
    'city', v_application.city,
    'submittedAt', v_application.created_at
  );

  -- The mandatory durable audit record. If this insert fails for any
  -- reason, the exception propagates and every statement in this function
  -- — including the deletes below — rolls back with it.
  insert into public.audit_logs (
    actor_id, actor_label, entity_type, entity_id, action, before_value, after_value
  ) values (
    p_actor_id, v_actor_label, 'application', p_application_id::text, 'delete',
    v_safe_before, jsonb_build_object('reason', p_reason, 'mediaJobsQueued', v_queued)
  )
  returning id into v_audit_id;

  delete from public.brand_application_revisions where application_id = p_application_id;
  delete from public.brand_application_status_history where application_id = p_application_id;
  delete from public.brand_application_documents where application_id = p_application_id;
  delete from public.brand_application_information_requests where application_id = p_application_id;
  delete from public.brand_applications where id = p_application_id;

  return jsonb_build_object(
    'ok', true, 'code', 'APPLICATION_DELETED', 'message', 'Application permanently deleted.',
    'before', to_jsonb(v_application), 'mediaJobsQueued', v_queued, 'auditLogId', v_audit_id
  );
end;
$$;

revoke all on function public.admin_delete_brand_application(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_delete_brand_application(uuid, uuid, text) to service_role;


-- ============================================================================
-- FINAL CORRECTIVE SECTION — provider-confirmed refund ledger
-- ============================================================================
-- The earlier draft in this still-unapplied migration allowed a staff member
-- to type an arbitrary provider reference and immediately mark an order as
-- refunded. That is intentionally replaced here. Staff may only create a
-- pending request. Confirmed money is created exclusively by the Paymob
-- exact, separately verified provider ingestion through
-- record_provider_refund_confirmation(). The ordinary Paymob transaction
-- callback is not sufficient because its signed amount is the original
-- transaction amount, not the exact partial-refund amount. Cancellation continues to rely on
-- orders.payment_status, which only the confirmed-allocation functions below
-- may change to partially_refunded/refunded.

alter table public.notifications add column if not exists delivery_key text;
create unique index if not exists notifications_delivery_key_idx
  on public.notifications(delivery_key)
  where delivery_key is not null;

drop function if exists public.record_order_refund(uuid, uuid, integer, text, text);
drop function if exists public.record_payment_attempt_refund(uuid, uuid, integer, text, text);
drop function if exists public.finalize_payment_attempt_coupon_redemption(uuid);
drop function if exists private.compute_order_refundable_balance_cents(uuid);
drop table if exists public.payment_refunds cascade;

create table public.payment_refund_requests (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references public.payment_attempts(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  target_kind text not null check (target_kind in ('order', 'failed_fulfillment')),
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'reversed')),
  -- The financial record survives account deletion. The immutable audit
  -- log retains the human-readable actor label if this FK is later nulled.
  requested_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (target_kind = 'order' and order_id is not null)
    or (target_kind = 'failed_fulfillment' and order_id is null)
  )
);

create unique index payment_refund_requests_one_pending_order_idx
  on public.payment_refund_requests(order_id)
  where status = 'pending' and order_id is not null;
create unique index payment_refund_requests_one_pending_failed_idx
  on public.payment_refund_requests(payment_attempt_id, target_kind)
  where status = 'pending' and target_kind = 'failed_fulfillment';
create index payment_refund_requests_attempt_idx
  on public.payment_refund_requests(payment_attempt_id, status);

create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references public.payment_attempts(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency = 'EGP'),
  provider_reference text not null unique,
  provider_event_id text not null unique,
  confirmed_at timestamptz not null default now()
);
create index payment_refunds_attempt_idx on public.payment_refunds(payment_attempt_id, confirmed_at);

create table public.payment_refund_allocations (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.payment_refunds(id) on delete restrict,
  request_id uuid not null unique references public.payment_refund_requests(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  target_kind text not null check (target_kind in ('order', 'failed_fulfillment')),
  amount_cents integer not null check (amount_cents > 0),
  allocated_at timestamptz not null default now(),
  allocated_by uuid references auth.users(id) on delete set null,
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null,
  reversal_reason text,
  check (
    (target_kind = 'order' and order_id is not null)
    or (target_kind = 'failed_fulfillment' and order_id is null)
  ),
  check (
    (reversed_at is null and reversed_by is null and reversal_reason is null)
    or (reversed_at is not null and nullif(trim(reversal_reason), '') is not null)
  )
);
create index payment_refund_allocations_order_idx
  on public.payment_refund_allocations(order_id) where reversed_at is null;
create unique index payment_refund_allocations_one_active_refund_idx
  on public.payment_refund_allocations(refund_id) where reversed_at is null;
create index payment_refund_allocations_attempt_target_idx
  on public.payment_refund_allocations(target_kind) where reversed_at is null;

alter table public.payment_refund_requests enable row level security;
alter table public.payment_refunds enable row level security;
alter table public.payment_refund_allocations enable row level security;
revoke all on public.payment_refund_requests from public, anon, authenticated;
revoke all on public.payment_refunds from public, anon, authenticated;
revoke all on public.payment_refund_allocations from public, anon, authenticated;
grant select on public.payment_refund_requests to service_role;
grant select on public.payment_refunds to service_role;
grant select on public.payment_refund_allocations to service_role;

create or replace function private.block_payment_refund_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'PROVIDER_REFUND_EVENTS_ARE_IMMUTABLE';
end;
$$;

create trigger payment_refunds_immutable
before update or delete on public.payment_refunds
for each row execute function private.block_payment_refund_event_mutation();
revoke all on function private.block_payment_refund_event_mutation() from public, anon, authenticated;

create or replace function private.recompute_order_refund_status(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_captured integer;
  v_confirmed integer;
  v_status text;
begin
  select id, payment_attempt_id, payment_method, status into v_order
  from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.payment_method = 'cash_on_delivery' or v_order.payment_attempt_id is null then
    raise exception 'ORDER_NOT_CARD_PAID';
  end if;

  select coalesce(sum(expected_amount_cents), 0)::integer into v_captured
  from private.payment_attempt_fulfillments
  where payment_attempt_id = v_order.payment_attempt_id
    and order_id = p_order_id
    and status = 'fulfilled';
  if v_captured <= 0 then raise exception 'ORDER_HAS_NO_CAPTURED_AMOUNT'; end if;

  select coalesce(sum(amount_cents), 0)::integer into v_confirmed
  from public.payment_refund_allocations
  where order_id = p_order_id and target_kind = 'order' and reversed_at is null;
  if v_confirmed > v_captured then raise exception 'CONFIRMED_REFUND_EXCEEDS_CAPTURED_BALANCE'; end if;

  v_status := case
    when v_confirmed = 0 then 'paid'
    when v_confirmed < v_captured then 'partially_refunded'
    else 'refunded'
  end;
  update public.orders set payment_status = v_status where id = p_order_id;
  return jsonb_build_object(
    'order_id', p_order_id,
    'captured_amount_cents', v_captured,
    'refunded_amount_cents', v_confirmed,
    'payment_status', v_status
  );
end;
$$;
revoke all on function private.recompute_order_refund_status(uuid) from public, anon, authenticated;

create or replace function private.recompute_failed_fulfillment_refund_status(p_payment_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_required integer;
  v_confirmed integer;
begin
  perform 1 from public.payment_attempts where id = p_payment_attempt_id for update;
  if not found then raise exception 'PAYMENT_ATTEMPT_NOT_FOUND'; end if;

  select coalesce(sum(expected_amount_cents), 0)::integer into v_required
  from private.payment_attempt_fulfillments
  where payment_attempt_id = p_payment_attempt_id and status = 'failed';
  if v_required = 0 then
    select case when status = 'fulfillment_failed' then amount_cents else 0 end into v_required
    from public.payment_attempts where id = p_payment_attempt_id;
  end if;

  select coalesce(sum(a.amount_cents), 0)::integer into v_confirmed
  from public.payment_refund_allocations a
  join public.payment_refund_requests r on r.id = a.request_id
  where r.payment_attempt_id = p_payment_attempt_id
    and a.target_kind = 'failed_fulfillment'
    and a.reversed_at is null;
  if v_confirmed > v_required then raise exception 'CONFIRMED_REFUND_EXCEEDS_FAILED_BALANCE'; end if;

  update public.payment_attempts
  set refunded_at = case when v_required > 0 and v_confirmed >= v_required then now() else null end,
      refund_note = case when v_required > 0 and v_confirmed >= v_required then 'Provider-confirmed failed-fulfillment refund' else null end,
      updated_at = now()
  where id = p_payment_attempt_id;
  return jsonb_build_object('required_cents', v_required, 'confirmed_cents', v_confirmed);
end;
$$;
revoke all on function private.recompute_failed_fulfillment_refund_status(uuid) from public, anon, authenticated;

create or replace function private.try_match_provider_refund(p_refund_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund record;
  v_request record;
  v_match_count integer;
  v_allocation_id uuid;
  v_matched_request_id uuid;
  v_matched_order_id uuid;
begin
  select * into v_refund from public.payment_refunds where id = p_refund_id for update;
  if v_refund.id is null then raise exception 'PROVIDER_REFUND_NOT_FOUND'; end if;
  if exists (
    select 1 from public.payment_refund_allocations
    where refund_id = p_refund_id and reversed_at is null
  ) then
    select a.id, a.request_id, a.order_id into v_allocation_id, v_matched_request_id, v_matched_order_id
    from public.payment_refund_allocations a
    where a.refund_id = p_refund_id and a.reversed_at is null;
    return jsonb_build_object(
      'refund_id', p_refund_id, 'allocation_id', v_allocation_id,
      'matched_request_id', v_matched_request_id, 'matched_order_id', v_matched_order_id,
      'matched', true, 'replayed', true
    );
  end if;

  select count(*)::integer into v_match_count
  from public.payment_refund_requests
  where payment_attempt_id = v_refund.payment_attempt_id
    and status = 'pending'
    and amount_cents = v_refund.amount_cents;
  if v_match_count <> 1 then
    return jsonb_build_object(
      'refund_id', p_refund_id, 'matched', false,
      'reason', case when v_match_count = 0 then 'NO_EXACT_PENDING_REQUEST' else 'AMBIGUOUS_PENDING_REQUESTS' end
    );
  end if;

  select * into v_request
  from public.payment_refund_requests
  where payment_attempt_id = v_refund.payment_attempt_id
    and status = 'pending'
    and amount_cents = v_refund.amount_cents
  for update;

  insert into public.payment_refund_allocations (
    refund_id, request_id, order_id, target_kind, amount_cents
  ) values (
    v_refund.id, v_request.id, v_request.order_id, v_request.target_kind, v_refund.amount_cents
  ) returning id into v_allocation_id;
  update public.payment_refund_requests
  set status = 'confirmed', updated_at = now()
  where id = v_request.id;

  if v_request.target_kind = 'order' then
    perform private.recompute_order_refund_status(v_request.order_id);
  else
    perform private.recompute_failed_fulfillment_refund_status(v_request.payment_attempt_id);
  end if;

  return jsonb_build_object(
    'refund_id', p_refund_id, 'allocation_id', v_allocation_id,
    'matched_request_id', v_request.id, 'matched_order_id', v_request.order_id,
    'matched', true, 'replayed', false
  );
end;
$$;
revoke all on function private.try_match_provider_refund(uuid) from public, anon, authenticated;

create or replace function public.request_order_refund(
  p_order_id uuid,
  p_actor_id uuid,
  p_amount_cents integer,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_captured integer;
  v_confirmed integer;
  v_request_id uuid;
  v_refund_id uuid;
  v_match jsonb;
begin
  if p_actor_id is null then raise exception 'ACTOR_REQUIRED'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  select id, payment_attempt_id, payment_method into v_order
  from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.payment_method = 'cash_on_delivery' or v_order.payment_attempt_id is null then
    raise exception 'ORDER_NOT_CARD_PAID';
  end if;
  perform 1 from public.payment_attempts where id = v_order.payment_attempt_id for update;

  if exists (
    select 1 from public.payment_refund_requests where order_id = p_order_id and status = 'pending'
  ) then raise exception 'REFUND_REQUEST_ALREADY_PENDING'; end if;

  select coalesce(sum(expected_amount_cents), 0)::integer into v_captured
  from private.payment_attempt_fulfillments
  where payment_attempt_id = v_order.payment_attempt_id
    and order_id = p_order_id and status = 'fulfilled';
  if v_captured <= 0 then raise exception 'ORDER_HAS_NO_CAPTURED_AMOUNT'; end if;
  select coalesce(sum(amount_cents), 0)::integer into v_confirmed
  from public.payment_refund_allocations
  where order_id = p_order_id and target_kind = 'order' and reversed_at is null;
  if v_confirmed + p_amount_cents > v_captured then raise exception 'REFUND_EXCEEDS_CAPTURED_BALANCE'; end if;

  insert into public.payment_refund_requests (
    payment_attempt_id, order_id, target_kind, amount_cents, requested_by, note
  ) values (
    v_order.payment_attempt_id, p_order_id, 'order', p_amount_cents, p_actor_id,
    nullif(trim(coalesce(p_note, '')), '')
  ) returning id into v_request_id;

  select id into v_refund_id
  from public.payment_refunds r
  where r.payment_attempt_id = v_order.payment_attempt_id
    and r.amount_cents = p_amount_cents
    and not exists (
      select 1 from public.payment_refund_allocations a
      where a.refund_id = r.id and a.reversed_at is null
    )
  order by r.confirmed_at
  limit 1;
  if v_refund_id is not null then v_match := private.try_match_provider_refund(v_refund_id); end if;

  return jsonb_build_object(
    'request_id', v_request_id,
    'status', case when coalesce((v_match ->> 'matched')::boolean, false) then 'confirmed' else 'pending' end,
    'matched_refund_id', v_refund_id
  );
end;
$$;
revoke all on function public.request_order_refund(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.request_order_refund(uuid, uuid, integer, text) to service_role;

create or replace function public.request_payment_attempt_refund(
  p_payment_attempt_id uuid,
  p_actor_id uuid,
  p_amount_cents integer,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt record;
  v_required integer;
  v_confirmed integer;
  v_request_id uuid;
  v_refund_id uuid;
  v_match jsonb;
begin
  if p_actor_id is null then raise exception 'ACTOR_REQUIRED'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  select * into v_attempt from public.payment_attempts where id = p_payment_attempt_id for update;
  if v_attempt.id is null then raise exception 'PAYMENT_ATTEMPT_NOT_FOUND'; end if;
  if exists (
    select 1 from public.payment_refund_requests
    where payment_attempt_id = p_payment_attempt_id
      and target_kind = 'failed_fulfillment' and status = 'pending'
  ) then raise exception 'REFUND_REQUEST_ALREADY_PENDING'; end if;

  select coalesce(sum(expected_amount_cents), 0)::integer into v_required
  from private.payment_attempt_fulfillments
  where payment_attempt_id = p_payment_attempt_id and status = 'failed';
  if v_required = 0 and v_attempt.status = 'fulfillment_failed' then v_required := v_attempt.amount_cents; end if;
  if v_required <= 0 then raise exception 'NO_FAILED_BUCKET_TO_REFUND'; end if;
  select coalesce(sum(a.amount_cents), 0)::integer into v_confirmed
  from public.payment_refund_allocations a
  join public.payment_refund_requests r on r.id = a.request_id
  where r.payment_attempt_id = p_payment_attempt_id
    and a.target_kind = 'failed_fulfillment' and a.reversed_at is null;
  if v_confirmed + p_amount_cents > v_required then raise exception 'REFUND_EXCEEDS_CAPTURED_BALANCE'; end if;

  insert into public.payment_refund_requests (
    payment_attempt_id, order_id, target_kind, amount_cents, requested_by, note
  ) values (
    p_payment_attempt_id, null, 'failed_fulfillment', p_amount_cents, p_actor_id,
    nullif(trim(coalesce(p_note, '')), '')
  ) returning id into v_request_id;

  select id into v_refund_id
  from public.payment_refunds r
  where r.payment_attempt_id = p_payment_attempt_id
    and r.amount_cents = p_amount_cents
    and not exists (
      select 1 from public.payment_refund_allocations a
      where a.refund_id = r.id and a.reversed_at is null
    )
  order by r.confirmed_at
  limit 1;
  if v_refund_id is not null then v_match := private.try_match_provider_refund(v_refund_id); end if;
  return jsonb_build_object(
    'request_id', v_request_id,
    'status', case when coalesce((v_match ->> 'matched')::boolean, false) then 'confirmed' else 'pending' end,
    'matched_refund_id', v_refund_id
  );
end;
$$;
revoke all on function public.request_payment_attempt_refund(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.request_payment_attempt_refund(uuid, uuid, integer, text) to service_role;

create or replace function public.record_provider_refund_confirmation(
  p_payment_attempt_id uuid,
  p_provider_reference text,
  p_provider_event_id text,
  p_amount_cents integer,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt record;
  v_existing record;
  v_refund_id uuid;
  v_confirmed integer;
  v_match jsonb;
begin
  if nullif(trim(coalesce(p_provider_reference, '')), '') is null then raise exception 'PROVIDER_REFERENCE_REQUIRED'; end if;
  if nullif(trim(coalesce(p_provider_event_id, '')), '') is null then raise exception 'PROVIDER_EVENT_ID_REQUIRED'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_currency <> 'EGP' then raise exception 'REFUND_CURRENCY_MISMATCH'; end if;

  select * into v_attempt from public.payment_attempts where id = p_payment_attempt_id for update;
  if v_attempt.id is null then raise exception 'PAYMENT_ATTEMPT_NOT_FOUND'; end if;
  if v_attempt.paid_at is null then raise exception 'PAYMENT_ATTEMPT_NOT_CAPTURED'; end if;

  select * into v_existing from public.payment_refunds
  where provider_event_id = p_provider_event_id or provider_reference = p_provider_reference;
  if v_existing.id is not null then
    if v_existing.payment_attempt_id = p_payment_attempt_id
       and v_existing.amount_cents = p_amount_cents
       and v_existing.currency = p_currency then
      v_match := private.try_match_provider_refund(v_existing.id);
      return jsonb_build_object(
        'refund_id', v_existing.id,
        'matched_request_id', v_match ->> 'matched_request_id',
        'matched_order_id', v_match ->> 'matched_order_id',
        'replayed', true
      );
    end if;
    raise exception 'PROVIDER_REFUND_EVENT_CONFLICT';
  end if;

  select coalesce(sum(amount_cents), 0)::integer into v_confirmed
  from public.payment_refunds where payment_attempt_id = p_payment_attempt_id;
  if v_confirmed + p_amount_cents > v_attempt.amount_cents then
    raise exception 'PROVIDER_REFUND_EXCEEDS_CAPTURED_PAYMENT';
  end if;

  insert into public.payment_refunds (
    payment_attempt_id, amount_cents, currency, provider_reference, provider_event_id
  ) values (
    p_payment_attempt_id, p_amount_cents, p_currency, trim(p_provider_reference), trim(p_provider_event_id)
  ) returning id into v_refund_id;
  v_match := private.try_match_provider_refund(v_refund_id);
  return jsonb_build_object(
    'refund_id', v_refund_id,
    'matched_request_id', v_match ->> 'matched_request_id',
    'matched_order_id', v_match ->> 'matched_order_id',
    'replayed', false
  );
end;
$$;
revoke all on function public.record_provider_refund_confirmation(uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.record_provider_refund_confirmation(uuid, text, text, integer, text) to service_role;

-- Equal-value sibling requests make automatic matching intentionally stop.
-- An admin may resolve that ambiguity, but can only allocate an existing
-- verified provider event to an exact-value pending request from the
-- same captured payment. This RPC can never create a financial event.
create or replace function public.allocate_provider_refund(
  p_refund_id uuid,
  p_request_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund record;
  v_request record;
  v_allocation_id uuid;
begin
  if p_actor_id is null then raise exception 'ACTOR_REQUIRED'; end if;

  select * into v_refund
  from public.payment_refunds
  where id = p_refund_id
  for update;
  if v_refund.id is null then raise exception 'PROVIDER_REFUND_NOT_FOUND'; end if;
  if exists (
    select 1 from public.payment_refund_allocations
    where refund_id = p_refund_id and reversed_at is null
  ) then
    raise exception 'PROVIDER_REFUND_ALREADY_ALLOCATED';
  end if;

  select * into v_request
  from public.payment_refund_requests
  where id = p_request_id
  for update;
  if v_request.id is null then raise exception 'REFUND_REQUEST_NOT_FOUND'; end if;
  if v_request.status <> 'pending' then raise exception 'REFUND_REQUEST_NOT_PENDING'; end if;
  if v_request.payment_attempt_id <> v_refund.payment_attempt_id then
    raise exception 'REFUND_REQUEST_PAYMENT_MISMATCH';
  end if;
  if v_request.amount_cents <> v_refund.amount_cents then
    raise exception 'REFUND_REQUEST_AMOUNT_MISMATCH';
  end if;

  insert into public.payment_refund_allocations (
    refund_id, request_id, order_id, target_kind, amount_cents, allocated_by
  ) values (
    v_refund.id, v_request.id, v_request.order_id, v_request.target_kind,
    v_refund.amount_cents, p_actor_id
  ) returning id into v_allocation_id;

  update public.payment_refund_requests
  set status = 'confirmed', updated_at = pg_catalog.now()
  where id = v_request.id;

  if v_request.target_kind = 'order' then
    perform private.recompute_order_refund_status(v_request.order_id);
  else
    perform private.recompute_failed_fulfillment_refund_status(v_request.payment_attempt_id);
  end if;

  return pg_catalog.jsonb_build_object(
    'allocation_id', v_allocation_id,
    'refund_id', v_refund.id,
    'request_id', v_request.id,
    'order_id', v_request.order_id,
    'target_kind', v_request.target_kind,
    'amount_cents', v_refund.amount_cents
  );
end;
$$;
revoke all on function public.allocate_provider_refund(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.allocate_provider_refund(uuid, uuid, uuid) to service_role;

create or replace function public.reverse_order_refund_allocation(
  p_order_id uuid,
  p_allocation_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allocation record;
  v_order_status text;
begin
  if p_actor_id is null then raise exception 'ACTOR_REQUIRED'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'REVERSAL_REASON_REQUIRED'; end if;
  select * into v_allocation from public.payment_refund_allocations where id = p_allocation_id for update;
  if v_allocation.id is null then raise exception 'REFUND_ALLOCATION_NOT_FOUND'; end if;
  if v_allocation.reversed_at is not null then raise exception 'REFUND_ALLOCATION_ALREADY_REVERSED'; end if;
  if v_allocation.target_kind <> 'order' or v_allocation.order_id is null then
    raise exception 'ORDER_REFUND_ALLOCATION_REQUIRED';
  end if;
  if v_allocation.order_id <> p_order_id then raise exception 'REFUND_ALLOCATION_ORDER_MISMATCH'; end if;
  select status into v_order_status from public.orders where id = v_allocation.order_id for update;
  if v_order_status = 'cancelled' then raise exception 'CANNOT_REVERSE_AFTER_CANCELLATION'; end if;

  update public.payment_refund_allocations
  set reversed_at = now(), reversed_by = p_actor_id, reversal_reason = trim(p_reason)
  where id = p_allocation_id;
  update public.payment_refund_requests
  set status = 'reversed', updated_at = now()
  where id = v_allocation.request_id;
  perform private.recompute_order_refund_status(v_allocation.order_id);
  return jsonb_build_object(
    'allocation_id', p_allocation_id, 'order_id', v_allocation.order_id,
    'refund_id', v_allocation.refund_id, 'reversed', true
  );
end;
$$;
revoke all on function public.reverse_order_refund_allocation(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reverse_order_refund_allocation(uuid, uuid, uuid, text) to service_role;

create or replace function public.list_order_refund_summaries(p_order_ids uuid[])
returns table (
  order_id uuid,
  captured_amount_cents integer,
  refunded_amount_cents integer,
  pending_amount_cents integer,
  payment_status text,
  last_confirmed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id,
    coalesce((
      select sum(f.expected_amount_cents)::integer
      from private.payment_attempt_fulfillments f
      where f.order_id = o.id and f.status = 'fulfilled'
    ), 0),
    coalesce((
      select sum(a.amount_cents)::integer
      from public.payment_refund_allocations a
      where a.order_id = o.id and a.target_kind = 'order' and a.reversed_at is null
    ), 0),
    coalesce((
      select sum(r.amount_cents)::integer
      from public.payment_refund_requests r
      where r.order_id = o.id and r.status = 'pending'
    ), 0),
    o.payment_status,
    (
      select max(pr.confirmed_at)
      from public.payment_refund_allocations a
      join public.payment_refunds pr on pr.id = a.refund_id
      where a.order_id = o.id and a.reversed_at is null
    )
  from public.orders o
  where o.id = any(p_order_ids);
$$;
revoke all on function public.list_order_refund_summaries(uuid[]) from public, anon, authenticated;
grant execute on function public.list_order_refund_summaries(uuid[]) to service_role;

create or replace function public.list_payment_attempts_needing_refund_review()
returns table (
  payment_attempt_id uuid,
  user_id uuid,
  status text,
  amount_cents integer,
  currency text,
  is_partial boolean,
  refund_amount_cents integer,
  pending_refund_amount_cents integer,
  refunded_at timestamptz,
  refund_note text,
  created_at timestamptz,
  paid_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with balances as (
    select
      pa.*,
      exists (
        select 1 from private.payment_attempt_fulfillments f
        where f.payment_attempt_id = pa.id and f.status = 'fulfilled'
      ) and exists (
        select 1 from private.payment_attempt_fulfillments f
        where f.payment_attempt_id = pa.id and f.status = 'failed'
      ) as partial,
      greatest(
        coalesce((
          select sum(f.expected_amount_cents)::integer
          from private.payment_attempt_fulfillments f
          where f.payment_attempt_id = pa.id and f.status = 'failed'
        ), case when pa.status = 'fulfillment_failed' then pa.amount_cents else 0 end),
        0
      ) as required_cents
    from public.payment_attempts pa
  )
  select
    b.id,
    b.user_id,
    b.status,
    b.amount_cents,
    b.currency,
    b.partial,
    greatest(b.required_cents - coalesce((
      select sum(a.amount_cents)::integer
      from public.payment_refund_allocations a
      join public.payment_refund_requests r on r.id = a.request_id
      where r.payment_attempt_id = b.id
        and a.target_kind = 'failed_fulfillment' and a.reversed_at is null
    ), 0), 0),
    coalesce((
      select sum(r.amount_cents)::integer
      from public.payment_refund_requests r
      where r.payment_attempt_id = b.id
        and r.target_kind = 'failed_fulfillment' and r.status = 'pending'
    ), 0),
    b.refunded_at,
    b.refund_note,
    b.created_at,
    b.paid_at
  from balances b
  where b.status = 'fulfillment_failed'
     or (b.status = 'fulfilled' and b.partial)
  order by b.paid_at desc nulls last, b.created_at desc;
$$;
revoke all on function public.list_payment_attempts_needing_refund_review() from public, anon, authenticated;
grant execute on function public.list_payment_attempts_needing_refund_review() to service_role;


-- ============================================================================
-- FINAL CORRECTIVE SECTION — coupon conversion inside paid fulfillment
-- ============================================================================
-- The existing paid-order function already increments coupons.used_count,
-- but did not write coupon_redemptions. The earlier draft attempted to do
-- that from the Node webhook after place_paid_order committed, creating a
-- fatal gap. Move the existing implementation into private and wrap it in
-- one public database transaction. The transaction-local attempt id lets
-- the universal coupon guard exclude only the reservation currently being
-- converted while still counting every competing card reservation against
-- COD and other card checkouts.

drop trigger if exists coupons_enforce_max_uses_guard on public.coupons;

insert into private.coupon_redemptions (master_order_id, coupon_code, redeemed_at, released_at)
select
  o.master_order_id,
  max(o.coupon_code),
  min(o.created_at),
  case when bool_and(o.status = 'cancelled') then now() else null end
from public.orders o
where o.coupon_code is not null and o.master_order_id is not null
group by o.master_order_id
on conflict (master_order_id) do update set
  coupon_code = excluded.coupon_code,
  redeemed_at = least(private.coupon_redemptions.redeemed_at, excluded.redeemed_at),
  released_at = case
    when private.coupon_redemptions.released_at is not null then private.coupon_redemptions.released_at
    else excluded.released_at
  end;

update public.coupons c
set used_count = (
  select count(*)::integer
  from private.coupon_redemptions r
  where r.coupon_code = c.code and r.released_at is null
);

create or replace function private.enforce_coupon_max_uses_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_active_reservations integer;
  v_conversion_attempt uuid;
begin
  if new.used_count <= old.used_count or new.max_uses is null then return new; end if;
  begin
    v_conversion_attempt := nullif(pg_catalog.current_setting('private.card_coupon_conversion_attempt', true), '')::uuid;
  exception when invalid_text_representation then
    v_conversion_attempt := null;
  end;

  select count(*)::integer into v_active_reservations
  from private.coupon_reservations cr
  join public.payment_attempts pa on pa.id = cr.payment_attempt_id
  where cr.coupon_code = new.code
    and pa.status in ('created', 'pending', 'processing', 'paid', 'reflecting')
    and (v_conversion_attempt is null or cr.payment_attempt_id <> v_conversion_attempt);

  if new.used_count + v_active_reservations > new.max_uses then
    raise exception 'COUPON_LIMIT_REACHED';
  end if;
  return new;
end;
$$;

create trigger coupons_enforce_max_uses_guard
before update of used_count on public.coupons
for each row execute function private.enforce_coupon_max_uses_guard();
revoke all on function private.enforce_coupon_max_uses_guard() from public, anon, authenticated;

revoke all on function public.place_paid_order(uuid) from public, anon, authenticated, service_role;
alter function public.place_paid_order(uuid) set schema private;
revoke all on function private.place_paid_order(uuid) from public, anon, authenticated, service_role;

create or replace function public.place_paid_order(p_payment_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt record;
  v_result jsonb;
  v_coupon_code text;
  v_reservation_id uuid;
  v_master_order_id uuid;
begin
  select id, status, coupon_snapshot, master_order_id into v_attempt
  from public.payment_attempts where id = p_payment_attempt_id for update;
  if v_attempt.id is null then raise exception 'PAYMENT_ATTEMPT_NOT_FOUND'; end if;
  v_coupon_code := nullif(v_attempt.coupon_snapshot ->> 'code', '');

  if v_coupon_code is not null and v_attempt.status not in ('fulfilled', 'fulfillment_failed') then
    select id into v_reservation_id
    from private.coupon_reservations
    where payment_attempt_id = p_payment_attempt_id
    for update;
    if v_reservation_id is null then raise exception 'COUPON_RESERVATION_MISSING'; end if;
    perform 1 from public.coupons where code = v_coupon_code for update;
    if not found then raise exception 'COUPON_NOT_FOUND'; end if;
    perform pg_catalog.set_config('private.card_coupon_conversion_attempt', p_payment_attempt_id::text, true);
  end if;

  v_result := private.place_paid_order(p_payment_attempt_id);

  select master_order_id into v_master_order_id
  from public.payment_attempts where id = p_payment_attempt_id;
  if v_coupon_code is not null and v_result ->> 'status' = 'fulfilled' then
    delete from private.coupon_reservations where payment_attempt_id = p_payment_attempt_id;
    if v_master_order_id is null then raise exception 'COUPON_REDEMPTION_MISSING_MASTER_ORDER'; end if;
    insert into private.coupon_redemptions (master_order_id, coupon_code)
    values (v_master_order_id, v_coupon_code)
    on conflict (master_order_id) do nothing;
  elsif v_result ->> 'status' = 'fulfillment_failed' then
    delete from private.coupon_reservations where payment_attempt_id = p_payment_attempt_id;
  end if;

  return v_result;
end;
$$;
revoke all on function public.place_paid_order(uuid) from public, anon, authenticated;
grant execute on function public.place_paid_order(uuid) to service_role;
