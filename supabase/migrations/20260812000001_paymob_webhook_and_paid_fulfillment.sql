-- ============================================================================
-- Paymob webhook + paid-order fulfillment (Card Sandbox v1, remaining scope)
-- ============================================================================
-- Builds on 20260811000001_payment_attempts.sql. Adds:
--   - private.payment_webhook_events (webhook delivery dedup log)
--   - public.mark_payment_attempt_paid / mark_payment_attempt_declined
--     (the ONLY two ways payment_attempts.status can ever become 'paid' or
--     move out of pending/processing — both service_role-only, both called
--     exclusively from the HMAC-verified webhook route)
--   - public.place_paid_order (per-bucket order creation for a paid attempt
--     — does NOT touch place_order/orders' COD path in any way)
--   - public.payment_attempt_fulfillment_summary (ownership-checked, safe
--     for a signed-in customer to call directly)
--   - orders.payment_method widened to allow 'card'; orders.payment_attempt_id
--   - a minimal manual-refund audit marker on payment_attempts, so two admins
--     (or one admin double-clicking) can't both process the same refund
--
-- Explicitly NOT in this migration: HMAC verification itself (that's
-- application code — see lib/payments/paymobWebhook.ts — Postgres never
-- sees the secret or the raw request), saved cards, MOTO, wallets,
-- subscriptions, split payments, automatic refund API calls.
--
-- Critical invariant preserved by construction: PAYMENT CAPTURE and ORDER
-- FULFILLMENT are separate, non-reversible-into-each-other facts.
-- mark_payment_attempt_paid never runs any fulfillment logic itself and
-- commits as its own independent statement; place_paid_order can fail,
-- crash, or be retried any number of times afterward without ever being
-- able to un-set paid_at — no function anywhere in this file contains an
-- UPDATE that clears paid_at, and mark_payment_attempt_declined explicitly
-- refuses to touch a payment_attempt that has already moved past
-- pending/processing.
-- ============================================================================

-- ============================================================================
-- private.payment_webhook_events — delivery-level idempotency log
-- ============================================================================
create table if not exists private.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paymob',
  provider_event_id text not null,
  payment_attempt_id uuid references public.payment_attempts(id),
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);
revoke all on private.payment_webhook_events from public, anon, authenticated;

-- ============================================================================
-- payment_attempts additions: manual-refund audit marker
-- ============================================================================
-- Deliberately minimal, per the approved architecture's §14/§17: this does
-- NOT call any refund API and does NOT compute refund amounts on its own —
-- it only records "an admin says this was handled", once, so a second
-- admin (or the same admin refreshing a stale screen) can't double-process
-- the same refund. The actual amount owed is still whatever
-- payment_attempt_fulfillment_summary()/the ledger already make computable.
alter table public.payment_attempts add column if not exists refunded_at timestamptz;
alter table public.payment_attempts add column if not exists refund_note text;
alter table public.payment_attempts add column if not exists refunded_by uuid references auth.users(id) on delete set null;

-- ============================================================================
-- orders: allow 'card' as a payment_method, and trace an order back to the
-- payment_attempt that produced it. Cash on Delivery's own default/behavior
-- is completely unchanged — 'cash_on_delivery' remains valid and remains
-- the default place_order() always uses.
-- ============================================================================
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('cash_on_delivery', 'card'));

alter table public.orders add column if not exists payment_attempt_id uuid
  references public.payment_attempts(id);
create index if not exists orders_payment_attempt_id_idx
  on public.orders (payment_attempt_id) where payment_attempt_id is not null;

-- ============================================================================
-- mark_payment_attempt_paid — the ONLY function that may ever set
-- payment_attempts.status = 'paid'. Called exactly once per verified
-- webhook delivery, from the webhook route, after HMAC verification has
-- already passed. Runs and commits as its own independent statement —
-- deliberately NOT combined with place_paid_order in the same call, so a
-- later crash/exception in fulfillment can never roll back the paid fact
-- recorded here.
-- ============================================================================
create or replace function public.mark_payment_attempt_paid(
  p_payment_attempt_id uuid,
  p_provider_transaction_id text,
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
  v_inserted int;
  v_attempt record;
begin
  if p_provider_event_id is null or btrim(p_provider_event_id) = '' then
    raise exception 'INVALID_PROVIDER_EVENT_ID';
  end if;

  -- Log first, then decide whether to process — a redelivered event (same
  -- transaction id) is caught here before touching payment state at all.
  insert into private.payment_webhook_events (provider, provider_event_id, payment_attempt_id)
  values ('paymob', p_provider_event_id, p_payment_attempt_id)
  on conflict (provider, provider_event_id) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_attempt from public.payment_attempts where id = p_payment_attempt_id for update;
  if not found then
    raise exception 'PAYMENT_ATTEMPT_NOT_FOUND';
  end if;

  if v_inserted = 0 then
    return jsonb_build_object('payment_attempt_id', v_attempt.id, 'status', v_attempt.status, 'replayed', true);
  end if;

  -- Already paid (or further along) — idempotent no-op. paid_at is never
  -- re-set, never touched a second time.
  if v_attempt.status in ('paid', 'reflecting', 'fulfilled', 'fulfillment_failed') then
    return jsonb_build_object('payment_attempt_id', v_attempt.id, 'status', v_attempt.status, 'replayed', true);
  end if;

  if v_attempt.status not in ('pending', 'processing') then
    raise exception 'PAYMENT_ATTEMPT_STATE_ANOMALY: current status is %, expected pending/processing', v_attempt.status;
  end if;

  if p_amount_cents is distinct from v_attempt.amount_cents or p_currency is distinct from v_attempt.currency then
    raise exception 'AMOUNT_MISMATCH: attempt expects % % but webhook reported % %',
      v_attempt.amount_cents, v_attempt.currency, p_amount_cents, p_currency;
  end if;

  update public.payment_attempts
  set status = 'paid',
      paid_at = now(),
      provider_transaction_id = p_provider_transaction_id,
      updated_at = now()
  where id = p_payment_attempt_id;

  return jsonb_build_object('payment_attempt_id', p_payment_attempt_id, 'status', 'paid', 'replayed', false);
end;
$$;

revoke all on function public.mark_payment_attempt_paid(uuid, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.mark_payment_attempt_paid(uuid, text, text, integer, text)
  to service_role;

-- ============================================================================
-- mark_payment_attempt_declined — a webhook-reported failure/decline.
-- Refuses to touch an attempt that has already moved past pending/
-- processing, so a late or out-of-order "declined" event can never undo an
-- already-recorded 'paid' fact.
-- ============================================================================
create or replace function public.mark_payment_attempt_declined(
  p_payment_attempt_id uuid,
  p_provider_transaction_id text,
  p_provider_event_id text,
  p_failure_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted int;
  v_attempt record;
begin
  if p_provider_event_id is null or btrim(p_provider_event_id) = '' then
    raise exception 'INVALID_PROVIDER_EVENT_ID';
  end if;
  if p_failure_reason is null or btrim(p_failure_reason) = '' then
    raise exception 'INVALID_FAILURE_REASON';
  end if;

  insert into private.payment_webhook_events (provider, provider_event_id, payment_attempt_id)
  values ('paymob', p_provider_event_id, p_payment_attempt_id)
  on conflict (provider, provider_event_id) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_attempt from public.payment_attempts where id = p_payment_attempt_id for update;
  if not found then
    raise exception 'PAYMENT_ATTEMPT_NOT_FOUND';
  end if;

  if v_inserted = 0 then
    return jsonb_build_object('payment_attempt_id', v_attempt.id, 'status', v_attempt.status, 'replayed', true);
  end if;

  if v_attempt.status not in ('pending', 'processing') then
    -- Includes the "already paid" case — never overwrite a paid attempt
    -- with a decline, no matter what order the events arrive in.
    return jsonb_build_object('payment_attempt_id', v_attempt.id, 'status', v_attempt.status, 'replayed', true);
  end if;

  update public.payment_attempts
  set status = 'failed',
      failure_reason = p_failure_reason,
      provider_transaction_id = p_provider_transaction_id,
      updated_at = now()
  where id = p_payment_attempt_id;

  return jsonb_build_object('payment_attempt_id', p_payment_attempt_id, 'status', 'failed', 'replayed', false);
end;
$$;

revoke all on function public.mark_payment_attempt_declined(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.mark_payment_attempt_declined(uuid, text, text, text)
  to service_role;

-- ============================================================================
-- place_paid_order — per-bucket order creation for an already-'paid'
-- attempt. Mirrors place_order()'s own bucketing (partner pool vs. one
-- order per independent brand — see supabase/migrations/
-- 20260807000001_brand_partner_fulfillment_and_order_splitting.sql) but is
-- a fully independent function: place_order() itself is not modified,
-- referenced, or called by this function in any way, so Cash on Delivery
-- cannot be affected by anything in this migration.
--
-- Retry-safe: the `for update` row lock on payment_attempts serializes
-- concurrent calls for the same attempt; an attempt already 'fulfilled' or
-- 'fulfillment_failed' short-circuits immediately; a bucket the ledger
-- already shows 'fulfilled' is skipped on any later call. Each bucket is
-- attempted inside its own BEGIN/EXCEPTION block (PL/pgSQL's real
-- subtransaction mechanism — see the approved architecture's §4 for why
-- explicit SAVEPOINT statements are not usable here), so one bucket's
-- stock/data conflict can never undo a sibling bucket that already
-- committed.
-- ============================================================================
create or replace function public.place_paid_order(p_payment_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt record;
  v_group_id uuid;
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
begin
  select * into v_attempt from public.payment_attempts where id = p_payment_attempt_id for update;
  if not found then
    raise exception 'PAYMENT_ATTEMPT_NOT_FOUND';
  end if;

  if v_attempt.status in ('fulfilled', 'fulfillment_failed') then
    return jsonb_build_object(
      'payment_attempt_id', p_payment_attempt_id,
      'status', v_attempt.status,
      'order_group_id', v_attempt.order_group_id,
      'replayed', true
    );
  end if;

  if v_attempt.status not in ('paid', 'reflecting') then
    raise exception 'PAYMENT_ATTEMPT_NOT_PAID: current status is %, expected paid', v_attempt.status;
  end if;

  if v_attempt.status = 'paid' then
    update public.payment_attempts set status = 'reflecting', updated_at = now() where id = p_payment_attempt_id;
  end if;

  v_group_id := coalesce(v_attempt.order_group_id, gen_random_uuid());

  select value into v_shipping_settings from public.site_content where key = 'shipping_settings';
  v_flat_fee := coalesce((v_shipping_settings ->> 'flatDeliveryFeeEgp')::numeric, 50);
  v_free_threshold := coalesce((v_shipping_settings ->> 'freeShippingThresholdEgp')::numeric, 1500);

  -- Pass 1: distinct bucket keys — identical rule to place_order(): a
  -- Zakhnook-partner brand (or a missing brand attribution) pools into
  -- '__mahaly_pool__'; every other brand gets its own key.
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

  -- Pass 2: one bucket at a time, each isolated.
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

      v_attempt_no := 0;
      loop
        v_order_number := 'LC-' || floor(100000 + random() * 900000)::text;
        begin
          insert into public.orders (
            order_number, user_id, status, payment_method, payment_status, payment_attempt_id,
            shipping_name, shipping_email, shipping_phone, shipping_address, shipping_city, shipping_governorate,
            subtotal_usd, subtotal_egp, order_group_id, fulfillment_type, brand_slug
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

        if v_variant_id is not null then
          update public.product_variants
          set quantity = quantity - v_quantity, updated_at = now()
          where id = v_variant_id and quantity >= v_quantity and selling_status = 'active';

          get diagnostics v_updated = row_count;
          if v_updated = 0 then
            raise exception 'INSUFFICIENT_STOCK: %', v_item ->> 'name';
          end if;
        end if;

        insert into public.order_items (
          order_id, product_id, variant_id, name, brand, brand_slug, price, currency, size, color, quantity, image
        ) values (
          v_order_id, v_item ->> 'productId', v_variant_id, v_item ->> 'name', v_item ->> 'brand',
          v_brand_slug, v_price, v_currency, v_item ->> 'size', nullif(v_item ->> 'color', ''), v_quantity, ''
        );

        v_line_total := v_price * v_quantity;
        if v_currency = 'EGP' then
          v_subtotal_egp := v_subtotal_egp + v_line_total;
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
      set subtotal_usd = v_subtotal_usd, subtotal_egp = v_subtotal_egp, shipping_fee_egp = v_shipping_fee
      where id = v_order_id;

      insert into public.order_status_history (order_id, status, note)
      values (v_order_id, 'paid', 'Card payment confirmed via Paymob webhook');

      insert into private.payment_attempt_fulfillments (
        payment_attempt_id, bucket_key, brand_id, status, order_id, expected_amount_cents, fulfilled_at
      ) values (
        p_payment_attempt_id, v_bucket_key, v_bucket_brand_id, 'fulfilled', v_order_id,
        round((v_subtotal_egp + v_shipping_fee) * 100)::int, now()
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

  if v_any_fulfilled then
    update public.payment_attempts
    set status = 'fulfilled', order_group_id = v_group_id, processed_at = now(), updated_at = now()
    where id = p_payment_attempt_id;
  else
    update public.payment_attempts
    set status = 'fulfillment_failed', processed_at = now(), updated_at = now()
    where id = p_payment_attempt_id;
  end if;

  return jsonb_build_object(
    'payment_attempt_id', p_payment_attempt_id,
    'status', case when v_any_fulfilled then 'fulfilled' else 'fulfillment_failed' end,
    'order_group_id', case when v_any_fulfilled then v_group_id else null end,
    'is_partial', (v_any_fulfilled and v_any_failed),
    'replayed', false
  );
end;
$$;

revoke all on function public.place_paid_order(uuid) from public, anon, authenticated;
grant execute on function public.place_paid_order(uuid) to service_role;

-- ============================================================================
-- payment_attempt_fulfillment_summary — ownership-checked, safe to grant
-- directly to authenticated (a customer's own status page can call it).
-- ============================================================================
create or replace function public.payment_attempt_fulfillment_summary(p_payment_attempt_id uuid)
returns table (total_buckets int, fulfilled_buckets int, failed_buckets int, is_partial boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*)::int,
    count(*) filter (where f.status = 'fulfilled')::int,
    count(*) filter (where f.status = 'failed')::int,
    (count(*) filter (where f.status = 'fulfilled') > 0 and count(*) filter (where f.status = 'failed') > 0)
  from private.payment_attempt_fulfillments f
  join public.payment_attempts pa on pa.id = f.payment_attempt_id
  where f.payment_attempt_id = p_payment_attempt_id
    and pa.user_id = (select auth.uid());
$$;

revoke all on function public.payment_attempt_fulfillment_summary(uuid) from public;
grant execute on function public.payment_attempt_fulfillment_summary(uuid) to authenticated, service_role;

-- ============================================================================
-- mark_payment_attempt_refund_recorded — the smallest safe manual-refund
-- audit marker: records that an admin has handled a refund outside this
-- system (no Paymob Refund API call happens anywhere here), and refuses to
-- let it be recorded twice — preventing two admins (or one admin
-- double-clicking a stale screen) from both processing the same refund.
-- ============================================================================
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

  return jsonb_build_object('payment_attempt_id', p_payment_attempt_id, 'refunded_at', now());
end;
$$;

revoke all on function public.mark_payment_attempt_refund_recorded(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_payment_attempt_refund_recorded(uuid, uuid, text)
  to service_role;

-- ============================================================================
-- list_payment_attempts_needing_refund_review — admin visibility (§16).
-- private.payment_attempt_fulfillments has no PostgREST surface at all (the
-- `private` schema is never exposed to the API), so this is the only way
-- for an admin route to read it — service_role-only, called from a
-- requireStaffRole("admin")-gated API route, same convention as every
-- other admin data read in this codebase.
-- ============================================================================
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
    coalesce(
      (
        select sum(f.expected_amount_cents)::int
        from private.payment_attempt_fulfillments f
        where f.payment_attempt_id = pa.id and f.status = 'failed'
      ),
      case when pa.status = 'fulfillment_failed' then pa.amount_cents else 0 end
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
