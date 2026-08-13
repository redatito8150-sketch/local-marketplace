-- Atomic coordination between Paymob intentions and fulfillment transitions.
-- The brand rows are the shared lock boundary: transition requests already
-- lock them before computing blockers, and payment-attempt creation now does
-- the same before checking for an open transition and inserting the attempt.

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

-- Explicit reconciliation hook for operations/cron. Expired created or
-- pending intentions no longer block a fulfillment transition, and this RPC
-- makes their visible status match that fact without touching paid attempts.
create or replace function public.expire_stale_payment_attempts(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception 'INVALID_LIMIT';
  end if;

  with stale as (
    select id
    from public.payment_attempts
    where status in ('created', 'pending')
      and expires_at <= pg_catalog.now()
    order by expires_at
    limit p_limit
    for update skip locked
  )
  update public.payment_attempts pa
  set status = 'expired', updated_at = pg_catalog.now(),
      failure_reason = coalesce(pa.failure_reason, 'payment_intention_expired')
  from stale
  where pa.id = stale.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_stale_payment_attempts(integer)
  from public, anon, authenticated;
grant execute on function public.expire_stale_payment_attempts(integer)
  to service_role;
