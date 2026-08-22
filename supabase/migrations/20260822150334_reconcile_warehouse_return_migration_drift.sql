-- Reconcile the production drift after the original warehouse-return migrations
-- were registered before their final compatibility corrections were merged.
-- This migration is deliberately metadata/function-only: it does not change
-- sellable quantities or create inventory ledger movements.

-- Existing outbound returns that were already physically in transit before
-- explicit dispatch metadata was introduced need enough metadata to complete
-- the canonical Brand Portal confirmation flow.
update public.warehouse_transfer_items wti
set dispatched_qty = wti.requested_qty,
    dispatched_by = coalesce(wt.approved_by, wt.decided_by, wt.requested_by),
    dispatched_at = coalesce(wt.approved_at, wt.decided_at, wt.updated_at, wt.requested_at)
from public.warehouse_transfers wt
where wt.id = wti.transfer_id
  and wt.direction = 'to_brand'
  and wt.status in ('in_transit', 'partially_received')
  and wt.stock_reserved_at is not null
  and wti.dispatched_qty is null;

-- Make Brand Owner delivery confirmation retry-safe and compatible with
-- legacy partially-received documents. Only unresolved lines are finalized.
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
  if v_transfer.status = 'received' then
    return jsonb_build_object(
      'transfer_id', p_transfer_id,
      'status', 'received',
      'replayed', true
    );
  end if;
  if v_transfer.status not in ('in_transit', 'partially_received') then
    raise exception 'RETURN_NOT_AWAITING_BRAND_CONFIRMATION';
  end if;

  select
    count(*) filter (where wti.received_ok_qty is null),
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
