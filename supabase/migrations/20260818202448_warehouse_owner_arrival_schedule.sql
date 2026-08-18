-- The brand chooses the expected arrival while creating the inbound request.
-- This wrapper keeps the established five-argument request function intact for
-- older callers, while making the new arrival value part of the same database
-- transaction and the same idempotency decision.
create or replace function public.request_warehouse_transfer_with_arrival(
  p_brand_id uuid,
  p_actor_id uuid,
  p_items jsonb,
  p_note text,
  p_operation_key text,
  p_expected_arrival_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer_id uuid;
  v_transfer record;
begin
  if p_expected_arrival_at is null then
    raise exception 'EXPECTED_ARRIVAL_REQUIRED';
  end if;
  if p_expected_arrival_at < pg_catalog.now() - interval '5 minutes' then
    raise exception 'EXPECTED_ARRIVAL_MUST_BE_FUTURE';
  end if;

  v_transfer_id := public.request_warehouse_transfer(
    p_brand_id,
    p_actor_id,
    p_items,
    p_note,
    p_operation_key
  );

  select id, brand_id, requested_by, direction, expected_arrival_at
  into v_transfer
  from public.warehouse_transfers
  where id = v_transfer_id
  for update;

  if v_transfer.id is null
     or v_transfer.brand_id <> p_brand_id
     or v_transfer.requested_by <> p_actor_id
     or v_transfer.direction <> 'to_local' then
    raise exception 'WAREHOUSE_DOCUMENT_NOT_OWNED';
  end if;

  -- The original request RPC already protects the item payload with the
  -- operation key. Protect the newly-added arrival value as well so retrying
  -- the same key with a different appointment never edits the first request.
  if v_transfer.expected_arrival_at is not null
     and v_transfer.expected_arrival_at is distinct from p_expected_arrival_at then
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  if v_transfer.expected_arrival_at is null then
    update public.warehouse_transfers
    set expected_arrival_at = p_expected_arrival_at,
        updated_at = pg_catalog.now()
    where id = v_transfer_id;
  end if;

  return v_transfer_id;
end;
$$;

revoke all on function public.request_warehouse_transfer_with_arrival(uuid, uuid, jsonb, text, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.request_warehouse_transfer_with_arrival(uuid, uuid, jsonb, text, text, timestamptz)
to service_role;

-- Acceptance now records only Zakhnook's decision. It never creates or
-- overwrites the appointment chosen by the brand and it still has no stock
-- effect. A legacy pending document without an appointment may still be
-- accepted so historical work is not permanently blocked.
create or replace function public.accept_warehouse_document(
  p_transfer_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer record;
begin
  if p_actor_id is null then raise exception 'ACTOR_REQUIRED'; end if;

  select id, status, expected_arrival_at
  into v_transfer
  from public.warehouse_transfers
  where id = p_transfer_id
  for update;

  if v_transfer.id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_transfer.status not in ('pending', 'submitted') then
    raise exception 'DOCUMENT_NOT_SUBMITTED';
  end if;

  update public.warehouse_transfers
  set status = 'approved',
      approved_by = p_actor_id,
      approved_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = p_transfer_id;

  return jsonb_build_object(
    'transfer_id', p_transfer_id,
    'status', 'approved',
    'expected_arrival_at', v_transfer.expected_arrival_at
  );
end;
$$;

revoke all on function public.accept_warehouse_document(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.accept_warehouse_document(uuid, uuid)
to service_role;

-- Backward-compatible rollout path: an older application build may still call
-- the three-argument signature briefly. Ignore its date input and delegate to
-- the canonical two-argument decision so an admin can never replace the
-- brand's chosen appointment.
create or replace function public.accept_warehouse_document(
  p_transfer_id uuid,
  p_actor_id uuid,
  p_expected_arrival_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.accept_warehouse_document(p_transfer_id, p_actor_id);
end;
$$;

revoke all on function public.accept_warehouse_document(uuid, uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.accept_warehouse_document(uuid, uuid, timestamptz)
to service_role;

-- Preserve the database gate that forbids skipping acceptance and going
-- straight into receipt, while removing the old requirement that acceptance
-- itself must provide an appointment.
create or replace function private.enforce_warehouse_acceptance_before_receipt()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('pending', 'submitted')
     and new.status in ('in_transit', 'receiving', 'partially_received', 'received') then
    raise exception 'WAREHOUSE_DOCUMENT_ACCEPTANCE_REQUIRED';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_warehouse_acceptance_before_receipt()
from public, anon, authenticated, service_role;
