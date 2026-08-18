-- A brand may withdraw its own inbound request only until Zakhnook accepts
-- it.  The row lock makes the cancellation/acceptance race deterministic:
-- whichever operation locks first wins, and the other receives a stable
-- state error without touching stock.
create or replace function public.cancel_own_requested_warehouse_document(
  p_transfer_id uuid,
  p_brand_id uuid,
  p_actor_id uuid,
  p_note text
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
  if p_brand_id is null then raise exception 'BRAND_REQUIRED'; end if;
  if nullif(pg_catalog.btrim(p_note), '') is null then raise exception 'CANCELLATION_REASON_REQUIRED'; end if;

  select id, brand_id, direction, status, decided_by
  into v_transfer
  from public.warehouse_transfers
  where id = p_transfer_id
  for update;

  if v_transfer.id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_transfer.brand_id <> p_brand_id or v_transfer.direction <> 'to_local' then
    raise exception 'WAREHOUSE_DOCUMENT_NOT_OWNED';
  end if;

  -- Safe retry after the same owner already cancelled the request.
  if v_transfer.status = 'cancelled' and v_transfer.decided_by = p_actor_id then
    return jsonb_build_object('transfer_id', p_transfer_id, 'status', 'cancelled', 'replayed', true);
  end if;
  if v_transfer.status <> 'pending' then
    raise exception 'WAREHOUSE_DOCUMENT_CANCELLATION_LOCKED';
  end if;

  update public.warehouse_transfers
  set status = 'cancelled',
      decided_by = p_actor_id,
      decided_at = pg_catalog.now(),
      receiving_note = pg_catalog.btrim(p_note),
      updated_at = pg_catalog.now()
  where id = p_transfer_id;

  return jsonb_build_object('transfer_id', p_transfer_id, 'status', 'cancelled', 'replayed', false);
end;
$$;

revoke all on function public.cancel_own_requested_warehouse_document(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_own_requested_warehouse_document(uuid, uuid, uuid, text) to service_role;

-- Receipt functions are service-role-only, but this database guard still
-- prevents a future route or maintenance script from skipping acceptance.
-- Legacy approved/in-transit and partial receipts remain valid.
create or replace function private.enforce_warehouse_acceptance_before_receipt()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('pending', 'submitted')
     and new.status = 'approved'
     and new.expected_arrival_at is null then
    raise exception 'EXPECTED_ARRIVAL_REQUIRED';
  end if;
  if old.status in ('pending', 'submitted')
     and new.status in ('in_transit', 'receiving', 'partially_received', 'received') then
    raise exception 'WAREHOUSE_DOCUMENT_ACCEPTANCE_REQUIRED';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_warehouse_acceptance_before_receipt() from public, anon, authenticated, service_role;

drop trigger if exists warehouse_acceptance_before_receipt on public.warehouse_transfers;
create trigger warehouse_acceptance_before_receipt
before update of status on public.warehouse_transfers
for each row execute function private.enforce_warehouse_acceptance_before_receipt();
alter table public.warehouse_transfers
  add column if not exists expected_arrival_at timestamptz;

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
declare
  v_status text;
begin
  if p_actor_id is null then raise exception 'ACTOR_REQUIRED'; end if;
  if p_expected_arrival_at is null then raise exception 'EXPECTED_ARRIVAL_REQUIRED'; end if;
  if p_expected_arrival_at < pg_catalog.now() - interval '5 minutes' then
    raise exception 'EXPECTED_ARRIVAL_MUST_BE_FUTURE';
  end if;

  select status into v_status
  from public.warehouse_transfers
  where id = p_transfer_id
  for update;
  if v_status is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_status not in ('pending', 'submitted') then raise exception 'DOCUMENT_NOT_SUBMITTED'; end if;

  update public.warehouse_transfers
  set status = 'approved',
      approved_by = p_actor_id,
      approved_at = pg_catalog.now(),
      expected_arrival_at = p_expected_arrival_at,
      updated_at = pg_catalog.now()
  where id = p_transfer_id;

  return jsonb_build_object(
    'transfer_id', p_transfer_id,
    'status', 'approved',
    'expected_arrival_at', p_expected_arrival_at
  );
end;
$$;

revoke all on function public.accept_warehouse_document(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.accept_warehouse_document(uuid, uuid, timestamptz) to service_role;
