-- A Brand Owner delivery note never reopens a completed Stock Return Note.
-- The document remains `received` / Returned to brand while the note gets its
-- own small Admin follow-up lifecycle.

alter table public.warehouse_transfers
  add column if not exists brand_delivery_note_reviewed_at timestamptz,
  add column if not exists brand_delivery_note_reviewed_by uuid references auth.users(id) on delete set null;

create index if not exists warehouse_transfers_pending_brand_delivery_note_review_idx
  on public.warehouse_transfers (updated_at desc)
  where direction = 'to_brand'
    and status = 'received'
    and receiving_note is not null
    and pg_catalog.btrim(receiving_note) <> ''
    and brand_delivery_note_reviewed_at is null;

create or replace function public.confirm_warehouse_return_received(
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
  v_line_count integer;
  v_ready_count integer;
  v_items jsonb;
  v_result jsonb;
begin
  if p_actor_id is null then raise exception 'ACTOR_REQUIRED'; end if;
  if p_brand_id is null then raise exception 'BRAND_REQUIRED'; end if;
  if pg_catalog.length(coalesce(p_note, '')) > 2000 then
    raise exception 'DELIVERY_NOTE_TOO_LONG';
  end if;

  select id, brand_id, direction, status
  into v_transfer
  from public.warehouse_transfers
  where id = p_transfer_id
  for update;

  if v_transfer.id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_transfer.brand_id <> p_brand_id then raise exception 'WAREHOUSE_DOCUMENT_NOT_OWNED'; end if;
  if v_transfer.direction <> 'to_brand' then raise exception 'TRANSFER_DIRECTION_MISMATCH'; end if;
  if v_transfer.status <> 'in_transit' then raise exception 'RETURN_NOT_AWAITING_BRAND_CONFIRMATION'; end if;

  select
    count(*),
    count(*) filter (
      where wti.received_ok_qty is null
        and wti.dispatched_qty is not null
        and wti.dispatched_qty = wti.requested_qty
    ),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'item_id', wti.id,
          'received_ok_qty', wti.dispatched_qty,
          'damaged_qty', 0,
          'missing_qty', 0,
          'item_note', null
        )
        order by wti.id
      ) filter (
        where wti.received_ok_qty is null
          and wti.dispatched_qty is not null
          and wti.dispatched_qty = wti.requested_qty
      ),
      '[]'::jsonb
    )
  into v_line_count, v_ready_count, v_items
  from public.warehouse_transfer_items wti
  where wti.transfer_id = p_transfer_id;

  if v_line_count = 0 then raise exception 'RETURN_LINES_REQUIRED'; end if;
  if v_ready_count <> v_line_count then
    raise exception 'EVERY_RETURN_LINE_MUST_BE_DISPATCHED';
  end if;

  v_result := private.receive_warehouse_document_canonical(
    p_transfer_id,
    p_actor_id,
    v_items,
    nullif(pg_catalog.btrim(p_note), ''),
    'to_brand'
  );

  update public.warehouse_transfers
  set brand_delivery_note_reviewed_at = null,
      brand_delivery_note_reviewed_by = null
  where id = p_transfer_id;

  return v_result;
end;
$$;

revoke all on function public.confirm_warehouse_return_received(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.confirm_warehouse_return_received(uuid, uuid, uuid, text)
  to service_role;

create or replace function public.mark_brand_delivery_note_reviewed(
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
  v_reviewed_at timestamptz;
begin
  if p_actor_id is null then raise exception 'ACTOR_REQUIRED'; end if;

  select id, direction, status, receiving_note, brand_delivery_note_reviewed_at
  into v_transfer
  from public.warehouse_transfers
  where id = p_transfer_id
  for update;

  if v_transfer.id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_transfer.direction <> 'to_brand' or v_transfer.status <> 'received' then
    raise exception 'RETURN_MUST_BE_COMPLETED';
  end if;
  if nullif(pg_catalog.btrim(v_transfer.receiving_note), '') is null then
    raise exception 'BRAND_DELIVERY_NOTE_REQUIRED';
  end if;

  if v_transfer.brand_delivery_note_reviewed_at is not null then
    return jsonb_build_object(
      'transferId', p_transfer_id,
      'reviewedAt', v_transfer.brand_delivery_note_reviewed_at,
      'replayed', true
    );
  end if;

  v_reviewed_at := pg_catalog.now();
  update public.warehouse_transfers
  set brand_delivery_note_reviewed_at = v_reviewed_at,
      brand_delivery_note_reviewed_by = p_actor_id,
      updated_at = v_reviewed_at
  where id = p_transfer_id;

  return jsonb_build_object(
    'transferId', p_transfer_id,
    'reviewedAt', v_reviewed_at,
    'replayed', false
  );
end;
$$;

revoke all on function public.mark_brand_delivery_note_reviewed(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_brand_delivery_note_reviewed(uuid, uuid)
  to service_role;
