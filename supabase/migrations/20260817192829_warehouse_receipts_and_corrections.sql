-- Warehouse receipt facts and append-only correction documents.
--
-- The transfer document remains the immutable statement of what the brand
-- intended to ship. A receipt records what physically arrived. A correction
-- never edits a posted receipt; it appends balanced stock postings that point
-- back to the original transfer/receipt line.

-- ---------------------------------------------------------------------------
-- 1. Separate workflow, reconciliation and posting state.
-- ---------------------------------------------------------------------------

alter table public.warehouse_transfers
  add column if not exists reconciliation_status text not null default 'unreviewed';

alter table public.warehouse_transfers
  drop constraint if exists warehouse_transfers_reconciliation_status_check;
alter table public.warehouse_transfers
  add constraint warehouse_transfers_reconciliation_status_check check (
    reconciliation_status in (
      'unreviewed', 'clean', 'open_discrepancy', 'partially_settled',
      'settled', 'corrected'
    )
  );

update public.warehouse_transfers
set reconciliation_status = case
  when status in ('received', 'partially_received') and has_discrepancy then 'open_discrepancy'
  when status = 'received' then 'clean'
  else 'unreviewed'
end
where reconciliation_status = 'unreviewed';

alter table public.warehouse_transfer_items
  drop constraint if exists warehouse_transfer_items_quarantine_resolution_check;
alter table public.warehouse_transfer_items
  add constraint warehouse_transfer_items_quarantine_resolution_check check (
    quarantine_resolution is null or quarantine_resolution in (
      'written_off', 'returned_to_brand', 'restored_to_sellable',
      'substituted', 'split_resolved'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Human-readable counters for receipts and correction notes.
-- ---------------------------------------------------------------------------

create table if not exists public.warehouse_aux_document_counters (
  document_kind text primary key check (document_kind in ('receipt', 'correction')),
  last_value bigint not null default 0 check (last_value >= 0),
  updated_at timestamptz not null default now()
);

alter table public.warehouse_aux_document_counters enable row level security;
revoke all on public.warehouse_aux_document_counters from public, anon, authenticated, service_role;

create or replace function private.next_warehouse_aux_document_number(p_document_kind text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
  v_next bigint;
begin
  if p_document_kind not in ('receipt', 'correction') then
    raise exception 'INVALID_WAREHOUSE_AUX_DOCUMENT_KIND';
  end if;

  v_prefix := case when p_document_kind = 'receipt' then 'GRN' else 'CRN' end;

  insert into public.warehouse_aux_document_counters (document_kind, last_value)
  values (p_document_kind, 1)
  on conflict (document_kind) do update
    set last_value = public.warehouse_aux_document_counters.last_value + 1,
        updated_at = now()
  returning last_value into v_next;

  return v_prefix || '-' || pg_catalog.lpad(v_next::text, 6, '0');
end;
$$;

revoke all on function private.next_warehouse_aux_document_number(text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Posted physical receipts: expected line versus actual Variant.
-- ---------------------------------------------------------------------------

create table if not exists public.warehouse_receipts (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.warehouse_transfers(id) on delete restrict,
  receipt_number text not null unique,
  status text not null default 'posted' check (status in ('posted', 'partially_reversed', 'reversed')),
  settlement_status text not null default 'clean' check (
    settlement_status in ('clean', 'open_discrepancy', 'partially_settled', 'settled', 'corrected')
  ),
  operation_key text not null,
  payload_fingerprint text not null,
  note text,
  posted_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (transfer_id, operation_key)
);

create table if not exists public.warehouse_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.warehouse_receipts(id) on delete restrict,
  expected_transfer_item_id uuid not null references public.warehouse_transfer_items(id) on delete restrict,
  expected_variant_id uuid not null references public.product_variants(id) on delete restrict,
  actual_variant_id uuid references public.product_variants(id) on delete restrict,
  expected_qty integer not null check (expected_qty > 0),
  actual_good_qty integer not null default 0 check (actual_good_qty >= 0),
  actual_damaged_qty integer not null default 0 check (actual_damaged_qty >= 0),
  unidentified_qty integer not null default 0 check (unidentified_qty >= 0),
  expected_missing_qty integer not null default 0 check (expected_missing_qty >= 0),
  actual_excess_qty integer not null default 0 check (actual_excess_qty >= 0),
  outcome text not null check (
    outcome in ('exact', 'short', 'excess', 'damaged', 'substitution', 'unidentified', 'mixed')
  ),
  settlement_status text not null default 'clean' check (
    settlement_status in ('clean', 'open', 'partially_settled', 'settled', 'corrected')
  ),
  unidentified_sku text,
  item_note text,
  created_at timestamptz not null default now(),
  unique (receipt_id, expected_transfer_item_id),
  check (actual_variant_id is not null or actual_good_qty + actual_damaged_qty = 0),
  check (unidentified_qty = 0 or nullif(pg_catalog.btrim(unidentified_sku), '') is not null)
);

create index if not exists warehouse_receipts_transfer_posted_idx
  on public.warehouse_receipts (transfer_id, posted_at desc);
create index if not exists warehouse_receipt_lines_actual_variant_idx
  on public.warehouse_receipt_lines (actual_variant_id, created_at desc)
  where actual_variant_id is not null;
create index if not exists warehouse_receipt_lines_open_idx
  on public.warehouse_receipt_lines (receipt_id, created_at)
  where settlement_status in ('open', 'partially_settled');

-- ---------------------------------------------------------------------------
-- 4. Correction headers and balanced posting lines.
-- ---------------------------------------------------------------------------

create table if not exists public.warehouse_corrections (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.warehouse_transfers(id) on delete restrict,
  correction_number text not null unique,
  correction_type text not null check (
    correction_type in (
      'reclassification', 'quantity_adjustment', 'missing_recovery',
      'condition_resolution', 'reversal'
    )
  ),
  status text not null check (status in ('pending_approval', 'posted', 'rejected', 'reversed')),
  reason_code text not null check (
    reason_code in (
      'wrong_variant', 'count_error', 'duplicate_receipt', 'missing_found',
      'damage_regraded', 'return_to_brand', 'write_off', 'document_error', 'other'
    )
  ),
  note text not null check (length(pg_catalog.btrim(note)) >= 5),
  operation_key text not null,
  payload_fingerprint text not null,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  posted_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  rejection_note text,
  reverses_correction_id uuid references public.warehouse_corrections(id) on delete restrict,
  unique (transfer_id, operation_key),
  check (approved_by is null or approved_by is distinct from requested_by),
  check ((status <> 'posted') or (approved_by is not null and posted_at is not null)),
  check ((status <> 'rejected') or (rejected_by is not null and rejected_at is not null))
);

create table if not exists public.warehouse_correction_lines (
  id uuid primary key default gen_random_uuid(),
  correction_id uuid not null references public.warehouse_corrections(id) on delete restrict,
  source_receipt_line_id uuid references public.warehouse_receipt_lines(id) on delete restrict,
  source_bucket text check (
    source_bucket is null or source_bucket in (
      'damaged', 'missing', 'substitution', 'excess', 'unidentified'
    )
  ),
  action text not null check (
    action in (
      'reclassify', 'adjust_in', 'adjust_out', 'restore_to_sellable',
      'return_to_brand', 'write_off', 'accept_discrepancy'
    )
  ),
  from_variant_id uuid references public.product_variants(id) on delete restrict,
  to_variant_id uuid references public.product_variants(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  note text,
  created_at timestamptz not null default now(),
  check ((source_receipt_line_id is null) = (source_bucket is null)),
  check (
    (action = 'reclassify' and from_variant_id is not null and to_variant_id is not null and from_variant_id <> to_variant_id)
    or (action in ('adjust_in', 'restore_to_sellable') and from_variant_id is null and to_variant_id is not null)
    or (action in ('adjust_out', 'return_to_brand', 'write_off') and from_variant_id is not null and to_variant_id is null)
    or (action = 'accept_discrepancy' and from_variant_id is null and to_variant_id is null)
  )
);

create index if not exists warehouse_corrections_transfer_requested_idx
  on public.warehouse_corrections (transfer_id, requested_at desc);
create index if not exists warehouse_corrections_pending_idx
  on public.warehouse_corrections (requested_at, id)
  where status = 'pending_approval';
create unique index if not exists warehouse_corrections_one_active_reversal_idx
  on public.warehouse_corrections (reverses_correction_id)
  where reverses_correction_id is not null and status in ('pending_approval', 'posted');
create index if not exists warehouse_correction_lines_receipt_source_idx
  on public.warehouse_correction_lines (source_receipt_line_id)
  where source_receipt_line_id is not null;

-- ---------------------------------------------------------------------------
-- 5. RLS and explicit Data API privileges.
-- ---------------------------------------------------------------------------

alter table public.warehouse_receipts enable row level security;
alter table public.warehouse_receipt_lines enable row level security;
alter table public.warehouse_corrections enable row level security;
alter table public.warehouse_correction_lines enable row level security;

drop policy if exists "Warehouse receipt readers" on public.warehouse_receipts;
create policy "Warehouse receipt readers"
on public.warehouse_receipts for select to authenticated
using (
  exists (
    select 1
    from public.warehouse_transfers wt
    join public.brands b on b.id = wt.brand_id
    where wt.id = warehouse_receipts.transfer_id
      and (
        b.owner_user_id = (select auth.uid())
        or exists (
          select 1 from public.brand_staff bs
          where bs.brand_id = b.id and bs.user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.is_admin
        )
      )
  )
);

drop policy if exists "Warehouse receipt line readers" on public.warehouse_receipt_lines;
create policy "Warehouse receipt line readers"
on public.warehouse_receipt_lines for select to authenticated
using (
  exists (
    select 1
    from public.warehouse_receipts wr
    join public.warehouse_transfers wt on wt.id = wr.transfer_id
    join public.brands b on b.id = wt.brand_id
    where wr.id = warehouse_receipt_lines.receipt_id
      and (
        b.owner_user_id = (select auth.uid())
        or exists (
          select 1 from public.brand_staff bs
          where bs.brand_id = b.id and bs.user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.is_admin
        )
      )
  )
);

drop policy if exists "Warehouse correction readers" on public.warehouse_corrections;
create policy "Warehouse correction readers"
on public.warehouse_corrections for select to authenticated
using (
  exists (
    select 1
    from public.warehouse_transfers wt
    join public.brands b on b.id = wt.brand_id
    where wt.id = warehouse_corrections.transfer_id
      and (
        b.owner_user_id = (select auth.uid())
        or exists (
          select 1 from public.brand_staff bs
          where bs.brand_id = b.id and bs.user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.is_admin
        )
      )
  )
);

drop policy if exists "Warehouse correction line readers" on public.warehouse_correction_lines;
create policy "Warehouse correction line readers"
on public.warehouse_correction_lines for select to authenticated
using (
  exists (
    select 1
    from public.warehouse_corrections wc
    join public.warehouse_transfers wt on wt.id = wc.transfer_id
    join public.brands b on b.id = wt.brand_id
    where wc.id = warehouse_correction_lines.correction_id
      and (
        b.owner_user_id = (select auth.uid())
        or exists (
          select 1 from public.brand_staff bs
          where bs.brand_id = b.id and bs.user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.is_admin
        )
      )
  )
);

grant select on public.warehouse_receipts, public.warehouse_receipt_lines,
  public.warehouse_corrections, public.warehouse_correction_lines
  to authenticated, service_role;
revoke insert, update, delete on public.warehouse_receipts, public.warehouse_receipt_lines,
  public.warehouse_corrections, public.warehouse_correction_lines
  from public, anon, authenticated, service_role;

-- Receipt history is immutable once posted. Correction headers can only be
-- transitioned by the trusted functions below; lines never change.
create or replace function private.prevent_warehouse_posted_record_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'WAREHOUSE_POSTED_HISTORY_IS_IMMUTABLE';
end;
$$;

create or replace function private.guard_warehouse_receipt_state_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and pg_catalog.to_jsonb(new) - 'status' - 'settlement_status'
      = pg_catalog.to_jsonb(old) - 'status' - 'settlement_status'
  then
    return new;
  end if;
  raise exception 'WAREHOUSE_POSTED_HISTORY_IS_IMMUTABLE';
end;
$$;

create or replace function private.guard_warehouse_receipt_line_state_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and pg_catalog.to_jsonb(new) - 'settlement_status'
      = pg_catalog.to_jsonb(old) - 'settlement_status'
  then
    return new;
  end if;
  raise exception 'WAREHOUSE_POSTED_HISTORY_IS_IMMUTABLE';
end;
$$;

create or replace function private.guard_warehouse_correction_state_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and pg_catalog.to_jsonb(new)
      - 'status' - 'approved_by' - 'approved_at' - 'posted_at'
      - 'rejected_by' - 'rejected_at' - 'rejection_note'
      = pg_catalog.to_jsonb(old)
      - 'status' - 'approved_by' - 'approved_at' - 'posted_at'
      - 'rejected_by' - 'rejected_at' - 'rejection_note'
  then
    return new;
  end if;
  raise exception 'WAREHOUSE_POSTED_HISTORY_IS_IMMUTABLE';
end;
$$;

drop trigger if exists warehouse_receipts_immutable on public.warehouse_receipts;
create trigger warehouse_receipts_immutable
before update or delete on public.warehouse_receipts
for each row execute function private.guard_warehouse_receipt_state_update();

drop trigger if exists warehouse_receipt_lines_immutable on public.warehouse_receipt_lines;
create trigger warehouse_receipt_lines_immutable
before update or delete on public.warehouse_receipt_lines
for each row execute function private.guard_warehouse_receipt_line_state_update();

drop trigger if exists warehouse_correction_lines_immutable on public.warehouse_correction_lines;
create trigger warehouse_correction_lines_immutable
before update or delete on public.warehouse_correction_lines
for each row execute function private.prevent_warehouse_posted_record_mutation();

drop trigger if exists warehouse_corrections_immutable on public.warehouse_corrections;
create trigger warehouse_corrections_immutable
before update or delete on public.warehouse_corrections
for each row execute function private.guard_warehouse_correction_state_update();

-- ---------------------------------------------------------------------------
-- 6. Additive ledger vocabulary.
-- ---------------------------------------------------------------------------

alter table public.inventory_movements
  drop constraint if exists inventory_movements_related_entity_type_check;
alter table public.inventory_movements
  add constraint inventory_movements_related_entity_type_check check (
    related_entity_type is null or related_entity_type in (
      'order', 'warehouse_document', 'warehouse_receipt',
      'fulfillment_transition', 'adjustment', 'warehouse_correction'
    )
  );

alter table public.inventory_movements
  drop constraint if exists inventory_movements_movement_type_check;
alter table public.inventory_movements
  add constraint inventory_movements_movement_type_check check (movement_type in (
    'opening_balance', 'manual_adjustment', 'order_placed', 'order_cancelled',
    'return_restocked', 'admin_correction', 'legacy_opening_balance', 'import',
    'other', 'warehouse_transfer_received', 'warehouse_return_reserved',
    'warehouse_return_released', 'warehouse_transfer_shipped',
    'warehouse_quarantine_hold', 'warehouse_quarantine_release',
    'fulfillment_transition_snapshot', 'warehouse_receipt_actual',
    'warehouse_reclassification_out', 'warehouse_reclassification_in',
    'warehouse_correction_adjustment', 'warehouse_discrepancy_resolution'
  ));

-- ---------------------------------------------------------------------------
-- 7. Receive expected versus actual atomically.
-- ---------------------------------------------------------------------------

create or replace function public.receive_warehouse_document_v2(
  p_transfer_id uuid,
  p_actor_id uuid,
  p_lines jsonb,
  p_note text,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer record;
  v_receipt public.warehouse_receipts%rowtype;
  v_input_count integer;
  v_distinct_count integer;
  v_matched_count integer;
  v_remaining integer;
  v_line record;
  v_expected record;
  v_actual record;
  v_receipt_line_id uuid;
  v_good integer;
  v_damaged integer;
  v_unidentified integer;
  v_physical integer;
  v_missing integer;
  v_excess integer;
  v_legacy_good integer;
  v_legacy_damaged integer;
  v_legacy_missing integer;
  v_remaining_expected integer;
  v_outcome text;
  v_settlement text;
  v_has_discrepancy boolean := false;
  v_is_opening_stock boolean;
  v_new_quantity integer;
  v_new_brand_stock integer;
  v_result_items jsonb := '[]'::jsonb;
begin
  if nullif(pg_catalog.btrim(p_operation_key), '') is null or length(p_operation_key) > 160 then
    raise exception 'INVALID_OPERATION_KEY';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'RECEIPT_LINES_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('warehouse-receipt:' || p_transfer_id::text || ':' || p_operation_key, 0));

  select * into v_receipt
  from public.warehouse_receipts
  where transfer_id = p_transfer_id and operation_key = p_operation_key;
  if v_receipt.id is not null then
    if v_receipt.payload_fingerprint <> pg_catalog.md5(p_lines::text || '|' || coalesce(pg_catalog.btrim(p_note), '')) then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'receiptId', v_receipt.id,
      'receiptNumber', v_receipt.receipt_number,
      'status', (select status from public.warehouse_transfers where id = p_transfer_id),
      'replayed', true
    );
  end if;

  select id, brand_id, status, direction, related_fulfillment_transition_id
  into v_transfer
  from public.warehouse_transfers
  where id = p_transfer_id;
  if v_transfer.id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_transfer.direction <> 'to_local' then raise exception 'RECEIPT_V2_ONLY_SUPPORTS_INBOUND_DOCUMENTS'; end if;

  -- Global lock order for fulfillment and stock mutations: brand, document,
  -- then every involved Variant in deterministic UUID order.
  perform 1 from public.brands where id = v_transfer.brand_id for update;

  select id, brand_id, status, direction, related_fulfillment_transition_id
  into v_transfer
  from public.warehouse_transfers
  where id = p_transfer_id
  for update;
  if v_transfer.status not in ('pending', 'submitted', 'approved', 'in_transit', 'partially_received') then
    raise exception 'TRANSFER_ALREADY_DECIDED';
  end if;

  select count(*), count(distinct payload->>'item_id')
  into v_input_count, v_distinct_count
  from jsonb_array_elements(p_lines) as submitted(payload);
  if v_input_count <> v_distinct_count then raise exception 'DUPLICATE_OR_INVALID_TRANSFER_ITEM'; end if;

  select count(*) into v_matched_count
  from public.warehouse_transfer_items wti
  join jsonb_array_elements(p_lines) submitted(payload)
    on wti.id = (submitted.payload->>'item_id')::uuid
  where wti.transfer_id = p_transfer_id and wti.received_ok_qty is null;
  if v_matched_count <> v_input_count then
    raise exception 'TRANSFER_ITEM_NOT_FOUND_OR_ALREADY_RECONCILED';
  end if;

  perform 1
  from public.product_variants pv
  where pv.id in (
    select wti.variant_id
    from public.warehouse_transfer_items wti
    join jsonb_array_elements(p_lines) submitted(payload)
      on wti.id = (submitted.payload->>'item_id')::uuid
    union
    select nullif(submitted.payload->>'actual_variant_id', '')::uuid
    from jsonb_array_elements(p_lines) submitted(payload)
    where nullif(submitted.payload->>'actual_variant_id', '') is not null
  )
  order by pv.id
  for update;

  select exists (
    select 1
    from public.warehouse_transfer_items wti
    join jsonb_array_elements(p_lines) submitted(payload)
      on wti.id = (submitted.payload->>'item_id')::uuid
    where wti.transfer_id = p_transfer_id
      and (
        nullif(submitted.payload->>'actual_variant_id', '')::uuid is distinct from wti.variant_id
        or coalesce((submitted.payload->>'damaged_qty')::integer, 0) > 0
        or coalesce((submitted.payload->>'unidentified_qty')::integer, 0) > 0
        or coalesce((submitted.payload->>'good_qty')::integer, 0)
          + coalesce((submitted.payload->>'damaged_qty')::integer, 0)
          + coalesce((submitted.payload->>'unidentified_qty')::integer, 0)
          <> wti.requested_qty
      )
  ) into v_has_discrepancy;

  insert into public.warehouse_receipts (
    transfer_id, receipt_number, status, settlement_status,
    operation_key, payload_fingerprint, note, posted_by
  ) values (
    p_transfer_id, private.next_warehouse_aux_document_number('receipt'),
    'posted', case when v_has_discrepancy then 'open_discrepancy' else 'clean' end,
    p_operation_key,
    pg_catalog.md5(p_lines::text || '|' || coalesce(pg_catalog.btrim(p_note), '')),
    nullif(pg_catalog.btrim(p_note), ''), p_actor_id
  ) returning * into v_receipt;

  for v_line in
    select wti.id as item_id, wti.variant_id as expected_variant_id,
           wti.requested_qty, submitted.payload
    from public.warehouse_transfer_items wti
    join lateral (
      select payload
      from jsonb_array_elements(p_lines) submitted(payload)
      where submitted.payload->>'item_id' = wti.id::text
    ) submitted on true
    where wti.transfer_id = p_transfer_id
      and wti.received_ok_qty is null
    order by wti.id
  loop
    v_good := coalesce((v_line.payload->>'good_qty')::integer, 0);
    v_damaged := coalesce((v_line.payload->>'damaged_qty')::integer, 0);
    v_unidentified := coalesce((v_line.payload->>'unidentified_qty')::integer, 0);
    if v_good < 0 or v_damaged < 0 or v_unidentified < 0 then
      raise exception 'INVALID_RECONCILIATION_QUANTITY';
    end if;

    select pv.id, pv.quantity, pv.brand_stock_quantity, pv.product_id,
           pv.opening_stock_recognized_at, pv.is_archived, pv.selling_status,
           p.brand_id
    into v_expected
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = v_line.expected_variant_id;

    select null::uuid as id, null::integer as quantity,
           null::integer as brand_stock_quantity, null::text as product_id,
           null::timestamptz as opening_stock_recognized_at,
           null::boolean as is_archived, null::text as selling_status,
           null::uuid as brand_id
    into v_actual;
    if nullif(v_line.payload->>'actual_variant_id', '') is not null then
      select pv.id, pv.quantity, pv.brand_stock_quantity, pv.product_id,
             pv.opening_stock_recognized_at, pv.is_archived, pv.selling_status,
             p.brand_id
      into v_actual
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      where pv.id = (v_line.payload->>'actual_variant_id')::uuid;

      if v_actual.id is null then raise exception 'ACTUAL_VARIANT_NOT_FOUND'; end if;
      if v_actual.brand_id <> v_transfer.brand_id then raise exception 'ACTUAL_VARIANT_BRAND_MISMATCH'; end if;
      if v_actual.is_archived or v_actual.selling_status <> 'active' then
        raise exception 'ACTUAL_VARIANT_NOT_ACTIVE';
      end if;
    elsif v_good + v_damaged > 0 then
      raise exception 'ACTUAL_VARIANT_REQUIRED_FOR_IDENTIFIED_STOCK';
    end if;

    if v_unidentified > 0 and nullif(pg_catalog.btrim(v_line.payload->>'unidentified_sku'), '') is null then
      raise exception 'UNIDENTIFIED_SKU_REQUIRED';
    end if;

    v_physical := v_good + v_damaged + v_unidentified;
    if v_actual.id = v_expected.id and v_unidentified = 0 then
      v_missing := pg_catalog.greatest(v_line.requested_qty - v_physical, 0);
      v_excess := pg_catalog.greatest(v_physical - v_line.requested_qty, 0);
      v_legacy_good := pg_catalog.least(v_good, v_line.requested_qty);
      v_remaining_expected := v_line.requested_qty - v_legacy_good;
      v_legacy_damaged := pg_catalog.least(v_damaged, v_remaining_expected);
      v_legacy_missing := v_line.requested_qty - v_legacy_good - v_legacy_damaged;
    else
      v_missing := v_line.requested_qty;
      v_excess := pg_catalog.greatest(v_physical - v_line.requested_qty, 0);
      v_legacy_good := 0;
      v_legacy_damaged := 0;
      v_legacy_missing := v_line.requested_qty;
    end if;

    v_outcome := case
      when v_unidentified > 0 and (v_good > 0 or v_damaged > 0) then 'mixed'
      when v_unidentified > 0 then 'unidentified'
      when v_actual.id is distinct from v_expected.id then 'substitution'
      when v_excess > 0 and (v_damaged > 0 or v_missing > 0) then 'mixed'
      when v_excess > 0 then 'excess'
      when v_damaged > 0 and v_missing > 0 then 'mixed'
      when v_damaged > 0 then 'damaged'
      when v_missing > 0 then 'short'
      else 'exact'
    end;
    v_settlement := case when v_outcome = 'exact' then 'clean' else 'open' end;
    if v_settlement = 'open' then v_has_discrepancy := true; end if;

    insert into public.warehouse_receipt_lines (
      receipt_id, expected_transfer_item_id, expected_variant_id,
      actual_variant_id, expected_qty, actual_good_qty, actual_damaged_qty,
      unidentified_qty, expected_missing_qty, actual_excess_qty,
      outcome, settlement_status, unidentified_sku, item_note
    ) values (
      v_receipt.id, v_line.item_id, v_expected.id, v_actual.id,
      v_line.requested_qty, v_good, v_damaged, v_unidentified,
      v_missing, v_excess, v_outcome, v_settlement,
      nullif(pg_catalog.btrim(v_line.payload->>'unidentified_sku'), ''),
      nullif(pg_catalog.btrim(v_line.payload->>'item_note'), '')
    ) returning id into v_receipt_line_id;

    if v_actual.id is not null then
      if v_transfer.related_fulfillment_transition_id is not null then
        if v_actual.brand_stock_quantity < v_physical then
          raise exception 'INSUFFICIENT_BRAND_STOCK_AT_RECEIPT';
        end if;
        v_new_brand_stock := v_actual.brand_stock_quantity - v_physical;
      else
        v_new_brand_stock := v_actual.brand_stock_quantity;
      end if;

      v_new_quantity := v_actual.quantity + v_good;
      v_is_opening_stock := v_actual.quantity = 0 and v_new_quantity > 0
        and v_actual.opening_stock_recognized_at is null;

      update public.product_variants
      set quantity = v_new_quantity,
          brand_stock_quantity = v_new_brand_stock,
          opening_stock_recognized_at = case
            when v_is_opening_stock then coalesce(opening_stock_recognized_at, now())
            else opening_stock_recognized_at
          end,
          opening_stock_recognition_source = case
            when v_is_opening_stock then coalesce(opening_stock_recognition_source, 'warehouse_receipt')
            else opening_stock_recognition_source
          end,
          updated_at = now()
      where id = v_actual.id;

      if v_good > 0 then
        update public.products
        set first_stocked_at = coalesce(first_stocked_at, now())
        where id = v_actual.product_id;
        perform private.stamp_product_first_visible_if_eligible(v_actual.product_id);

        insert into public.inventory_movements (
          variant_id, product_id, brand_id, previous_quantity, quantity_delta,
          new_quantity, movement_type, reason, note, created_by, source,
          source_operation_key, from_location, to_location,
          related_entity_type, related_entity_id, is_opening_stock
        ) values (
          v_actual.id, v_actual.product_id, v_transfer.brand_id,
          v_actual.quantity, v_good, v_new_quantity,
          'warehouse_receipt_actual',
          case when v_actual.id = v_expected.id then 'Goods receipt posted' else 'Accepted Variant substitution' end,
          nullif(pg_catalog.btrim(v_line.payload->>'item_note'), ''),
          p_actor_id, 'warehouse_receipt',
          'warehouse-receipt:' || v_receipt.id::text || ':' || v_receipt_line_id::text || ':good',
          'in_transit_to_zakhnook', 'zakhnook_available',
          'warehouse_receipt', v_receipt.id, v_is_opening_stock
        );
      end if;

      if v_damaged > 0 then
        insert into public.inventory_movements (
          variant_id, product_id, brand_id, previous_quantity, quantity_delta,
          new_quantity, movement_type, reason, note, created_by, source,
          source_operation_key, from_location, to_location,
          related_entity_type, related_entity_id
        ) values (
          v_actual.id, v_actual.product_id, v_transfer.brand_id,
          v_new_quantity, 0, v_new_quantity,
          'warehouse_quarantine_hold', 'Physically received damaged units held for disposition',
          nullif(pg_catalog.btrim(v_line.payload->>'item_note'), ''),
          p_actor_id, 'warehouse_receipt',
          'warehouse-receipt:' || v_receipt.id::text || ':' || v_receipt_line_id::text || ':damaged',
          'in_transit_to_zakhnook', 'zakhnook_quarantine',
          'warehouse_receipt', v_receipt.id
        );
      end if;
    else
      v_new_quantity := 0;
    end if;

    update public.warehouse_transfer_items
    set received_ok_qty = v_legacy_good,
        damaged_qty = v_legacy_damaged,
        missing_qty = v_legacy_missing,
        item_note = coalesce(nullif(pg_catalog.btrim(v_line.payload->>'item_note'), ''), item_note),
        quarantine_resolved_at = case
          when v_outcome = 'substitution' and v_damaged = 0 then now()
          else quarantine_resolved_at
        end,
        quarantine_resolved_by = case
          when v_outcome = 'substitution' and v_damaged = 0 then p_actor_id
          else quarantine_resolved_by
        end,
        quarantine_resolution = case
          when v_outcome = 'substitution' and v_damaged = 0 then 'substituted'
          else quarantine_resolution
        end
    where id = v_line.item_id;

    v_result_items := v_result_items || jsonb_build_array(jsonb_build_object(
      'receipt_line_id', v_receipt_line_id,
      'expected_variant_id', v_expected.id,
      'variant_id', v_actual.id,
      'received_ok_qty', v_good,
      'damaged_qty', v_damaged,
      'missing_qty', v_missing,
      'excess_qty', v_excess,
      'new_quantity', v_new_quantity,
      'outcome', v_outcome
    ));
  end loop;

  select count(*) into v_remaining
  from public.warehouse_transfer_items
  where transfer_id = p_transfer_id and received_ok_qty is null;

  update public.warehouse_transfers
  set status = case when v_remaining = 0 then 'received' else 'partially_received' end,
      decided_by = case when v_remaining = 0 then p_actor_id else decided_by end,
      decided_at = case when v_remaining = 0 then now() else decided_at end,
      receiving_note = coalesce(nullif(pg_catalog.btrim(p_note), ''), receiving_note),
      has_discrepancy = has_discrepancy or v_has_discrepancy,
      reconciliation_status = case
        when has_discrepancy or v_has_discrepancy then 'open_discrepancy'
        when v_remaining = 0 then 'clean'
        else reconciliation_status
      end,
      updated_at = now()
  where id = p_transfer_id;

  return jsonb_build_object(
    'receiptId', v_receipt.id,
    'receiptNumber', v_receipt.receipt_number,
    'items', v_result_items,
    'status', case when v_remaining = 0 then 'received' else 'partially_received' end,
    'remaining_unreconciled', v_remaining,
    'replayed', false
  );
end;
$$;

revoke all on function public.receive_warehouse_document_v2(uuid, uuid, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.receive_warehouse_document_v2(uuid, uuid, jsonb, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 8. Correction request, four-eyes approval and atomic posting.
-- ---------------------------------------------------------------------------

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

create or replace function public.request_warehouse_correction(
  p_transfer_id uuid,
  p_actor_id uuid,
  p_correction_type text,
  p_reason_code text,
  p_note text,
  p_lines jsonb,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer record;
  v_existing public.warehouse_corrections%rowtype;
  v_correction public.warehouse_corrections%rowtype;
  v_line jsonb;
  v_line_count integer;
  v_source_line record;
  v_source_available integer;
  v_source_used integer;
begin
  if nullif(pg_catalog.btrim(p_operation_key), '') is null or length(p_operation_key) > 160 then raise exception 'INVALID_OPERATION_KEY'; end if;
  if nullif(pg_catalog.btrim(p_note), '') is null or length(pg_catalog.btrim(p_note)) < 5 then raise exception 'CORRECTION_NOTE_REQUIRED'; end if;
  if p_correction_type not in ('reclassification', 'quantity_adjustment', 'missing_recovery', 'condition_resolution', 'reversal') then raise exception 'INVALID_CORRECTION_TYPE'; end if;
  if p_reason_code not in ('wrong_variant', 'count_error', 'duplicate_receipt', 'missing_found', 'damage_regraded', 'return_to_brand', 'write_off', 'document_error', 'other') then raise exception 'INVALID_CORRECTION_REASON'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'CORRECTION_LINES_REQUIRED'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('warehouse-correction:' || p_transfer_id::text || ':' || p_operation_key, 0));

  select * into v_existing
  from public.warehouse_corrections
  where transfer_id = p_transfer_id and operation_key = p_operation_key;
  if v_existing.id is not null then
    if v_existing.payload_fingerprint <> pg_catalog.md5(
      p_correction_type || '|' || p_reason_code || '|' || pg_catalog.btrim(p_note) || '|' || p_lines::text
    ) then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('correctionId', v_existing.id, 'correctionNumber', v_existing.correction_number, 'status', v_existing.status, 'replayed', true);
  end if;

  select id, brand_id, status into v_transfer
  from public.warehouse_transfers where id = p_transfer_id;
  if v_transfer.id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_transfer.status not in ('received', 'partially_received') then raise exception 'CORRECTION_REQUIRES_POSTED_DOCUMENT'; end if;

  insert into public.warehouse_corrections (
    transfer_id, correction_number, correction_type, status,
    reason_code, note, operation_key, payload_fingerprint, requested_by
  ) values (
    p_transfer_id, private.next_warehouse_aux_document_number('correction'),
    p_correction_type, 'pending_approval', p_reason_code,
    pg_catalog.btrim(p_note), p_operation_key,
    pg_catalog.md5(p_correction_type || '|' || p_reason_code || '|' || pg_catalog.btrim(p_note) || '|' || p_lines::text),
    p_actor_id
  ) returning * into v_correction;

  v_line_count := 0;
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    if coalesce((v_line->>'quantity')::integer, 0) <= 0 then raise exception 'CORRECTION_QUANTITY_REQUIRED'; end if;
    if (v_line->>'action') in ('restore_to_sellable', 'return_to_brand', 'write_off', 'accept_discrepancy')
      and nullif(v_line->>'source_receipt_line_id', '') is null
    then
      raise exception 'DISCREPANCY_SOURCE_RECEIPT_LINE_REQUIRED';
    end if;

    if nullif(v_line->>'source_receipt_line_id', '') is not null then
      select wrl.id, wrl.actual_damaged_qty, wrl.expected_missing_qty,
             wrl.actual_good_qty, wrl.actual_excess_qty, wrl.unidentified_qty,
             wr.transfer_id, wrl.actual_variant_id, wrl.expected_variant_id
      into v_source_line
      from public.warehouse_receipt_lines wrl
      join public.warehouse_receipts wr on wr.id = wrl.receipt_id
      where wrl.id = (v_line->>'source_receipt_line_id')::uuid
      for update of wrl;
      if v_source_line.id is null or v_source_line.transfer_id <> p_transfer_id then
        raise exception 'CORRECTION_RECEIPT_LINE_MISMATCH';
      end if;
      if (v_line->>'source_bucket') not in ('damaged', 'missing', 'substitution', 'excess', 'unidentified') then
        raise exception 'CORRECTION_SOURCE_BUCKET_REQUIRED';
      end if;
      if (v_line->>'source_bucket') = 'damaged'
        and (v_line->>'action') not in ('restore_to_sellable', 'return_to_brand', 'write_off')
      then
        raise exception 'INVALID_DAMAGED_STOCK_RESOLUTION';
      end if;
      if (v_line->>'source_bucket') = 'missing'
        and (v_line->>'action') not in ('adjust_in', 'accept_discrepancy')
      then
        raise exception 'INVALID_MISSING_STOCK_RESOLUTION';
      end if;
      if (v_line->>'source_bucket') = 'substitution'
        and (v_line->>'action') not in ('reclassify', 'accept_discrepancy')
      then
        raise exception 'INVALID_SUBSTITUTION_RESOLUTION';
      end if;
      if (v_line->>'source_bucket') = 'excess'
        and (v_line->>'action') not in ('adjust_out', 'accept_discrepancy')
      then
        raise exception 'INVALID_EXCESS_RESOLUTION';
      end if;
      if (v_line->>'source_bucket') = 'unidentified'
        and (v_line->>'action') <> 'adjust_in'
      then
        raise exception 'INVALID_UNIDENTIFIED_STOCK_RESOLUTION';
      end if;
      if (v_line->>'source_bucket') = 'damaged'
        and (
          ((v_line->>'action') = 'restore_to_sellable' and nullif(v_line->>'to_variant_id', '')::uuid is distinct from v_source_line.actual_variant_id)
          or ((v_line->>'action') in ('return_to_brand', 'write_off') and nullif(v_line->>'from_variant_id', '')::uuid is distinct from v_source_line.actual_variant_id)
        )
      then
        raise exception 'DAMAGED_RESOLUTION_VARIANT_MISMATCH';
      end if;
      if (v_line->>'source_bucket') = 'missing'
        and (v_line->>'action') = 'adjust_in'
        and nullif(v_line->>'to_variant_id', '')::uuid is distinct from v_source_line.expected_variant_id
      then
        raise exception 'MISSING_RECOVERY_VARIANT_MISMATCH';
      end if;
      if (v_line->>'source_bucket') = 'substitution'
        and (
          v_source_line.actual_variant_id is null
          or v_source_line.actual_variant_id = v_source_line.expected_variant_id
          or (
            (v_line->>'action') = 'reclassify'
            and (
              nullif(v_line->>'from_variant_id', '')::uuid is distinct from v_source_line.actual_variant_id
              or nullif(v_line->>'to_variant_id', '')::uuid is distinct from v_source_line.expected_variant_id
            )
          )
        )
      then
        raise exception 'SUBSTITUTION_RESOLUTION_VARIANT_MISMATCH';
      end if;
      if (v_line->>'source_bucket') = 'excess'
        and (v_line->>'action') = 'adjust_out'
        and nullif(v_line->>'from_variant_id', '')::uuid is distinct from v_source_line.actual_variant_id
      then
        raise exception 'EXCESS_RESOLUTION_VARIANT_MISMATCH';
      end if;

      v_source_available := case
        when (v_line->>'source_bucket') = 'damaged' then v_source_line.actual_damaged_qty
        when (v_line->>'source_bucket') = 'missing' then v_source_line.expected_missing_qty
        when (v_line->>'source_bucket') = 'substitution' then case
          when v_source_line.actual_variant_id is distinct from v_source_line.expected_variant_id
            then v_source_line.actual_good_qty
          else 0
        end
        when (v_line->>'source_bucket') = 'excess' then v_source_line.actual_excess_qty
        else v_source_line.unidentified_qty
      end;
      select coalesce(sum(wcl.quantity), 0) into v_source_used
      from public.warehouse_correction_lines wcl
      join public.warehouse_corrections existing on existing.id = wcl.correction_id
      where wcl.source_receipt_line_id = v_source_line.id
        and wcl.source_bucket = v_line->>'source_bucket'
        and existing.status in ('pending_approval', 'posted');
      if v_source_used + (v_line->>'quantity')::integer > v_source_available then
        raise exception 'CORRECTION_EXCEEDS_OPEN_DISCREPANCY_QUANTITY';
      end if;
    end if;

    insert into public.warehouse_correction_lines (
      correction_id, source_receipt_line_id, source_bucket, action,
      from_variant_id, to_variant_id, quantity, note
    ) values (
      v_correction.id,
      nullif(v_line->>'source_receipt_line_id', '')::uuid,
      nullif(v_line->>'source_bucket', ''),
      v_line->>'action',
      nullif(v_line->>'from_variant_id', '')::uuid,
      nullif(v_line->>'to_variant_id', '')::uuid,
      (v_line->>'quantity')::integer,
      nullif(pg_catalog.btrim(v_line->>'note'), '')
    );
    v_line_count := v_line_count + 1;
  end loop;

  return jsonb_build_object(
    'correctionId', v_correction.id,
    'correctionNumber', v_correction.correction_number,
    'status', 'pending_approval',
    'lineCount', v_line_count,
    'replayed', false
  );
end;
$$;

revoke all on function public.request_warehouse_correction(uuid, uuid, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.request_warehouse_correction(uuid, uuid, text, text, text, jsonb, text)
  to service_role;

create or replace function public.approve_warehouse_correction(
  p_correction_id uuid,
  p_approver_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.post_warehouse_correction(p_correction_id, p_approver_id);
$$;

revoke all on function public.approve_warehouse_correction(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.approve_warehouse_correction(uuid, uuid)
  to service_role;

create or replace function public.reject_warehouse_correction(
  p_correction_id uuid,
  p_reviewer_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correction public.warehouse_corrections%rowtype;
begin
  if nullif(pg_catalog.btrim(p_note), '') is null or length(pg_catalog.btrim(p_note)) < 5 then
    raise exception 'CORRECTION_REJECTION_NOTE_REQUIRED';
  end if;

  select * into v_correction
  from public.warehouse_corrections
  where id = p_correction_id
  for update;

  if v_correction.id is null then raise exception 'CORRECTION_NOT_FOUND'; end if;
  if v_correction.status = 'rejected' then
    return jsonb_build_object(
      'correctionId', v_correction.id,
      'correctionNumber', v_correction.correction_number,
      'status', 'rejected',
      'replayed', true
    );
  end if;
  if v_correction.status <> 'pending_approval' then raise exception 'CORRECTION_NOT_PENDING'; end if;
  if v_correction.requested_by = p_reviewer_id then raise exception 'CORRECTION_REQUIRES_INDEPENDENT_REVIEWER'; end if;

  update public.warehouse_corrections
  set status = 'rejected', rejected_by = p_reviewer_id,
      rejected_at = now(), rejection_note = pg_catalog.btrim(p_note)
  where id = p_correction_id;

  return jsonb_build_object(
    'correctionId', v_correction.id,
    'correctionNumber', v_correction.correction_number,
    'status', 'rejected',
    'replayed', false
  );
end;
$$;

revoke all on function public.reject_warehouse_correction(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.reject_warehouse_correction(uuid, uuid, text)
  to service_role;

create or replace function public.request_warehouse_correction_reversal(
  p_original_correction_id uuid,
  p_actor_id uuid,
  p_note text,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.warehouse_corrections%rowtype;
  v_existing public.warehouse_corrections%rowtype;
  v_reversal public.warehouse_corrections%rowtype;
  v_unsupported_count integer;
  v_line_count integer;
  v_fingerprint text;
begin
  if nullif(pg_catalog.btrim(p_operation_key), '') is null or length(p_operation_key) > 160 then
    raise exception 'INVALID_OPERATION_KEY';
  end if;
  if nullif(pg_catalog.btrim(p_note), '') is null or length(pg_catalog.btrim(p_note)) < 5 then
    raise exception 'CORRECTION_NOTE_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('warehouse-correction-reversal:' || p_original_correction_id::text, 0)
  );

  select * into v_original
  from public.warehouse_corrections
  where id = p_original_correction_id
  for update;

  if v_original.id is null then raise exception 'CORRECTION_NOT_FOUND'; end if;
  if v_original.status <> 'posted' then raise exception 'ONLY_POSTED_CORRECTIONS_CAN_BE_REVERSED'; end if;
  if v_original.reverses_correction_id is not null then raise exception 'NESTED_CORRECTION_REVERSAL_NOT_ALLOWED'; end if;

  v_fingerprint := pg_catalog.md5(
    p_original_correction_id::text || '|' || pg_catalog.btrim(p_note)
  );

  select * into v_existing
  from public.warehouse_corrections
  where transfer_id = v_original.transfer_id and operation_key = p_operation_key;
  if v_existing.id is not null then
    if v_existing.payload_fingerprint <> v_fingerprint
      or v_existing.reverses_correction_id is distinct from p_original_correction_id
    then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'correctionId', v_existing.id,
      'correctionNumber', v_existing.correction_number,
      'status', v_existing.status,
      'replayed', true
    );
  end if;

  if exists (
    select 1 from public.warehouse_corrections
    where reverses_correction_id = p_original_correction_id
      and status in ('pending_approval', 'posted')
  ) then
    raise exception 'CORRECTION_REVERSAL_ALREADY_EXISTS';
  end if;

  select count(*) into v_unsupported_count
  from public.warehouse_correction_lines
  where correction_id = p_original_correction_id
    and (
      action not in ('reclassify', 'adjust_in', 'adjust_out')
      or source_receipt_line_id is not null
    );
  if v_unsupported_count > 0 then
    raise exception 'CORRECTION_CONTAINS_IRREVERSIBLE_PHYSICAL_ACTIONS';
  end if;

  insert into public.warehouse_corrections (
    transfer_id, correction_number, correction_type, status,
    reason_code, note, operation_key, payload_fingerprint, requested_by,
    reverses_correction_id
  ) values (
    v_original.transfer_id, private.next_warehouse_aux_document_number('correction'),
    'reversal', 'pending_approval', 'document_error',
    pg_catalog.btrim(p_note), p_operation_key, v_fingerprint, p_actor_id,
    p_original_correction_id
  ) returning * into v_reversal;

  insert into public.warehouse_correction_lines (
    correction_id, action, from_variant_id, to_variant_id, quantity, note
  )
  select
    v_reversal.id,
    case
      when line.action = 'reclassify' then 'reclassify'
      when line.action = 'adjust_in' then 'adjust_out'
      else 'adjust_in'
    end,
    case
      when line.action = 'reclassify' then line.to_variant_id
      when line.action = 'adjust_in' then line.to_variant_id
      else null
    end,
    case
      when line.action = 'reclassify' then line.from_variant_id
      when line.action = 'adjust_out' then line.from_variant_id
      else null
    end,
    line.quantity,
    'Reversal of ' || v_original.correction_number
  from public.warehouse_correction_lines line
  where line.correction_id = p_original_correction_id;

  get diagnostics v_line_count = row_count;
  if v_line_count = 0 then raise exception 'CORRECTION_LINES_REQUIRED'; end if;

  return jsonb_build_object(
    'correctionId', v_reversal.id,
    'correctionNumber', v_reversal.correction_number,
    'status', 'pending_approval',
    'lineCount', v_line_count,
    'replayed', false
  );
end;
$$;

revoke all on function public.request_warehouse_correction_reversal(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.request_warehouse_correction_reversal(uuid, uuid, text, text)
  to service_role;

comment on table public.warehouse_receipts is
  'Immutable physical receipt facts. The source transfer remains the expected document; these rows record what actually arrived.';
comment on table public.warehouse_corrections is
  'Append-only correction notes for posted warehouse documents. Stock changes occur only after independent approval.';
