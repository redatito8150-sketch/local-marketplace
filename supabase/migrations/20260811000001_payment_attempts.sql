-- ============================================================================
-- Payment Attempts — Phase 1 (approved Rev. 2 architecture)
-- ============================================================================
-- Durable local record for every Paymob Create-Intention call, plus the
-- schema-only per-bucket fulfillment ledger a later phase will populate.
--
-- Explicitly NOT in this migration: place_paid_order, any write path for
-- private.payment_attempt_fulfillments, the webhook event log, HMAC
-- handling, refunds. place_order/orders/cash-on-delivery are untouched.
--
-- Critical invariant this schema exists to protect (see the approved design
-- doc): PAYMENT CAPTURE and ORDER FULFILLMENT are separate facts. paid_at,
-- once set by a future webhook handler, must never be cleared — no code
-- path in this migration writes paid_at at all yet, but the column exists
-- so that invariant has somewhere durable to live from day one.
-- ============================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ============================================================================
-- public.payment_attempts
-- ============================================================================
create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'paymob' check (provider in ('paymob')),

  provider_intention_id text,
  provider_order_id bigint,
  provider_transaction_id text,
  -- provider_client_secret is intentionally NOT a column (Rev. 2 decision):
  -- client_secret is returned to the browser exactly once, at Create
  -- Intention time, and is never persisted anywhere server-side.
  special_reference text not null unique,

  -- Idempotency. idempotency_actor is always 'user:<uuid>' — card payment
  -- requires auth, so unlike orders.idempotency there is no guest actor
  -- shape here. client_request_id is the client-supplied Idempotency-Key
  -- header; request_hash detects "same key, different payload".
  idempotency_actor text not null check (idempotency_actor ~ '^user:'),
  client_request_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),

  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'EGP' check (currency = 'EGP'),

  status text not null default 'created' check (status in (
    'created', 'pending', 'processing', 'paid',
    'reflecting', 'fulfilled', 'fulfillment_failed',
    'failed', 'expired', 'cancelled'
  )),

  -- Resolved cart lines / validated shipping fields at intention-creation
  -- time — see lib/payments/intentionCart.ts. Authoritative for a future
  -- paid order's prices, since that's what was actually charged.
  cart_snapshot jsonb not null,
  shipping_snapshot jsonb not null,
  coupon_snapshot jsonb,

  -- Set only once fulfilled (a later phase) — no FK, since a group spans
  -- multiple orders rows, nothing single-row to reference.
  order_group_id uuid,
  -- A safe, categorized string only (e.g. 'paymob_request_rejected') — see
  -- lib/payments/createIntentionForCart.ts. Never raw provider/Postgres
  -- error text: customers can read this column (see the grant below).
  failure_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz,
  processed_at timestamptz
);

alter table public.payment_attempts enable row level security;

-- Duplicate intentions: a retried request with the same Idempotency-Key can
-- never create a second row, even under real concurrency — Postgres itself
-- enforces this at INSERT time via this index, not application code.
create unique index if not exists payment_attempts_actor_request_idx
  on public.payment_attempts (idempotency_actor, client_request_id);

-- Defense in depth, independent of the app-level idempotency check above.
create unique index if not exists payment_attempts_provider_intention_idx
  on public.payment_attempts (provider, provider_intention_id)
  where provider_intention_id is not null;

create index if not exists payment_attempts_user_id_idx
  on public.payment_attempts (user_id);

create index if not exists payment_attempts_order_group_id_idx
  on public.payment_attempts (order_group_id) where order_group_id is not null;

-- For a future sweep job — kept cheap regardless of table size.
create index if not exists payment_attempts_sweepable_idx
  on public.payment_attempts (expires_at)
  where status in ('created', 'pending', 'processing');

-- ============================================================================
-- RLS / grants — payment_attempts
-- ============================================================================
-- Same shape as the 2026-08-10 privacy migration's treatment of `orders`:
-- broad SELECT revoked, a narrow column grant re-added, a row policy
-- scoping it to the owner. No INSERT/UPDATE/DELETE grant to anon/
-- authenticated exists at all, ever — every write is a SECURITY DEFINER
-- RPC granted to service_role only, identical lockdown to place_order.
revoke all on public.payment_attempts from anon, authenticated;

drop policy if exists "Customers can read their own payment attempts" on public.payment_attempts;
create policy "Customers can read their own payment attempts"
  on public.payment_attempts for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Deliberately excludes cart_snapshot, shipping_snapshot, coupon_snapshot,
-- request_hash, idempotency_actor, client_request_id, and every raw
-- provider id (special_reference, provider_intention_id, provider_order_id,
-- provider_transaction_id) — none of that is "the approved architecture
-- explicitly requires it" territory. failure_reason IS included on purpose:
-- it's already a safe categorized string, and "your card was declined" is
-- useful UX.
grant select (
  id, status, amount_cents, currency, created_at, updated_at,
  paid_at, processed_at, expires_at, order_group_id, failure_reason
) on public.payment_attempts to authenticated;

-- ============================================================================
-- private.payment_attempt_fulfillments — schema only in Phase 1
-- ============================================================================
-- Not written to by any code path yet. place_paid_order (a later,
-- not-yet-approved-for-implementation phase) is what will populate this,
-- one row per fulfillment bucket, with the unique constraint below making
-- its own per-bucket retries idempotent.
create table if not exists private.payment_attempt_fulfillments (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references public.payment_attempts(id) on delete cascade,
  bucket_key text not null,
  brand_id uuid references public.brands(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'fulfilled', 'failed')),
  order_id uuid references public.orders(id),
  -- Authoritative source for this value: lib/payments/intentionCart.ts's
  -- computeIntentionAmount() -> buckets[].amountCents (see that file's
  -- module comment for the exact formula: bucket subtotal + that bucket's
  -- shipping allocation, rounded once to piasters; a bucket's discount
  -- allocation is added here only once coupon support ships — not invented
  -- now). sum(expected_amount_cents) over every bucket of one
  -- payment_attempt always equals that attempt's own amount_cents, by
  -- construction of that calculation, not by a separate reconciliation
  -- step run afterward.
  expected_amount_cents integer not null check (expected_amount_cents >= 0),
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  unique (payment_attempt_id, bucket_key)
);

-- Same schema-level lockout as private.order_idempotency /
-- private.coupon_redemptions — the private schema itself already has
-- "revoke all from public, anon, authenticated" above, so no RLS policy is
-- needed on this table at all; it's simply unreachable from anon/
-- authenticated by construction. This also means: customers may never
-- directly access this table, in any way, per the approved architecture.
revoke all on private.payment_attempt_fulfillments from public, anon, authenticated;

-- ============================================================================
-- RPCs — SECURITY DEFINER, service_role only. Mirrors place_order's own
-- lockdown convention exactly (see supabase/migrations/
-- 20260810000005_order_integrity_and_idempotency.sql).
-- ============================================================================

-- Idempotent creation of a payment_attempts row. The unique
-- (idempotency_actor, client_request_id) index above is what actually
-- enforces "the same key can never create two rows" at the database level,
-- even under real concurrency — this function's exception handler only
-- decides what response to build once that constraint fires; it is not
-- itself the source of the safety guarantee.
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
begin
  if p_user_id is null then
    raise exception 'INVALID_USER';
  end if;
  if p_idempotency_actor is null or p_idempotency_actor !~ '^user:' then
    raise exception 'INVALID_IDEMPOTENCY_ACTOR';
  end if;
  if p_client_request_id is null then
    raise exception 'INVALID_CLIENT_REQUEST_ID';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_REQUEST_HASH';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_currency is distinct from 'EGP' then
    raise exception 'INVALID_CURRENCY';
  end if;

  -- Generated here (not left to the column default) so the same value can
  -- be used to build special_reference in this same statement — see the
  -- approved architecture's §13: special_reference must be derived from
  -- the payment_attempt's own id, not an arbitrary/disconnected value.
  v_id := gen_random_uuid();
  v_special_reference := 'mahaly_' || v_id::text;

  begin
    insert into public.payment_attempts (
      id, user_id, special_reference, idempotency_actor, client_request_id,
      request_hash, amount_cents, currency, cart_snapshot, shipping_snapshot,
      coupon_snapshot, expires_at
    ) values (
      v_id, p_user_id, v_special_reference, p_idempotency_actor, p_client_request_id,
      p_request_hash, p_amount_cents, p_currency, p_cart_snapshot, p_shipping_snapshot,
      p_coupon_snapshot, now() + make_interval(secs => p_expires_in_seconds)
    );
  exception when unique_violation then
    -- Either the (idempotency_actor, client_request_id) index fired (the
    -- expected, common case: a retried/concurrent request reusing the same
    -- Idempotency-Key) or, in principle, the special_reference unique
    -- constraint did (practically impossible off a fresh gen_random_uuid()).
    select id, special_reference, status, request_hash
    into v_existing
    from public.payment_attempts
    where idempotency_actor = p_idempotency_actor
      and client_request_id = p_client_request_id;

    if not found then
      -- Not the idempotency index — surface the real error rather than
      -- mask an unrelated collision as a replay.
      raise;
    end if;

    if v_existing.request_hash <> p_request_hash then
      raise exception 'IDEMPOTENCY_CONFLICT: key belongs to a different request';
    end if;

    return jsonb_build_object(
      'payment_attempt_id', v_existing.id,
      'special_reference', v_existing.special_reference,
      'status', v_existing.status,
      'replayed', true
    );
  end;

  return jsonb_build_object(
    'payment_attempt_id', v_id,
    'special_reference', v_special_reference,
    'status', 'created',
    'replayed', false
  );
end;
$$;

revoke all on function public.create_payment_attempt(uuid, text, uuid, text, integer, text, jsonb, jsonb, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.create_payment_attempt(uuid, text, uuid, text, integer, text, jsonb, jsonb, jsonb, integer)
  to service_role;

-- created -> pending, once Paymob has confirmed the intention. A
-- compare-and-swap on status (the WHERE clause) — same shape as
-- transition_order_status: a second call once the row is already past
-- 'created' fails loudly (PAYMENT_ATTEMPT_STATUS_CONFLICT) instead of
-- silently overwriting provider ids or resurrecting a terminal row.
create or replace function public.mark_paymob_intention_created(
  p_payment_attempt_id uuid,
  p_provider_intention_id text,
  p_provider_order_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_provider_intention_id is null or btrim(p_provider_intention_id) = '' then
    raise exception 'INVALID_PROVIDER_INTENTION_ID';
  end if;

  update public.payment_attempts
  set status = 'pending',
      provider_intention_id = p_provider_intention_id,
      provider_order_id = p_provider_order_id,
      updated_at = now()
  where id = p_payment_attempt_id
    and status = 'created';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'PAYMENT_ATTEMPT_STATUS_CONFLICT';
  end if;
end;
$$;

revoke all on function public.mark_paymob_intention_created(uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.mark_paymob_intention_created(uuid, text, bigint)
  to service_role;

-- created -> failed. p_failure_reason must already be a safe, categorized
-- string by the time it reaches here (see
-- lib/payments/createIntentionForCart.ts's categorizePaymobFailure) —
-- customers can read this column directly (see the grant above), so this
-- function does not, and must not, receive raw provider/Postgres error text.
create or replace function public.mark_paymob_intention_failed(
  p_payment_attempt_id uuid,
  p_failure_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_failure_reason is null or btrim(p_failure_reason) = '' then
    raise exception 'INVALID_FAILURE_REASON';
  end if;

  update public.payment_attempts
  set status = 'failed',
      failure_reason = p_failure_reason,
      updated_at = now()
  where id = p_payment_attempt_id
    and status = 'created';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'PAYMENT_ATTEMPT_STATUS_CONFLICT';
  end if;
end;
$$;

revoke all on function public.mark_paymob_intention_failed(uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_paymob_intention_failed(uuid, text)
  to service_role;
