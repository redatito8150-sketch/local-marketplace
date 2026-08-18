-- Keep legacy warehouse documents (those received before canonical GRNs)
-- aligned with the same reconciliation status used by the current queue.
-- A quarantine disposition closes the whole legacy transfer item, so once
-- every discrepant item is resolved the document is corrected.

create or replace function private.sync_legacy_warehouse_transfer_reconciliation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.warehouse_transfers wt
  set reconciliation_status = case
        when exists (
          select 1
          from public.warehouse_transfer_items wti
          where wti.transfer_id = new.transfer_id
            and (coalesce(wti.damaged_qty, 0) > 0 or coalesce(wti.missing_qty, 0) > 0)
            and (wti.quarantine_resolved_at is null or wti.quarantine_resolution is null)
        ) then 'open_discrepancy'
        else 'corrected'
      end,
      updated_at = now()
  where wt.id = new.transfer_id
    and wt.status = 'received'
    and not exists (
      select 1
      from public.warehouse_receipts wr
      where wr.transfer_id = wt.id
    );

  return new;
end;
$$;

drop trigger if exists warehouse_transfer_items_sync_legacy_reconciliation
  on public.warehouse_transfer_items;
create trigger warehouse_transfer_items_sync_legacy_reconciliation
after update of quarantine_resolved_at, quarantine_resolution
on public.warehouse_transfer_items
for each row
when (
  old.quarantine_resolved_at is distinct from new.quarantine_resolved_at
  or old.quarantine_resolution is distinct from new.quarantine_resolution
)
execute function private.sync_legacy_warehouse_transfer_reconciliation();

-- Repair legacy received documents already resolved before this trigger
-- existed. Canonical receipts are deliberately excluded.
update public.warehouse_transfers wt
set reconciliation_status = 'corrected',
    updated_at = now()
where wt.status = 'received'
  and wt.reconciliation_status in ('open_discrepancy', 'partially_settled')
  and not exists (
    select 1
    from public.warehouse_receipts wr
    where wr.transfer_id = wt.id
  )
  and not exists (
    select 1
    from public.warehouse_transfer_items wti
    where wti.transfer_id = wt.id
      and (coalesce(wti.damaged_qty, 0) > 0 or coalesce(wti.missing_qty, 0) > 0)
      and (wti.quarantine_resolved_at is null or wti.quarantine_resolution is null)
  );

revoke all on function private.sync_legacy_warehouse_transfer_reconciliation()
  from public, anon, authenticated;
