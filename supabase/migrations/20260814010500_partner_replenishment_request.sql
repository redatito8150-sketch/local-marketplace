-- ============================================================================
-- Partner replenishment: document-first, not declared-stock-first.
--
-- Until now, a partner brand had to first self-report "how much I have on
-- hand" via set_warehouse_brand_stock (an arbitrarily-editable
-- product_variants.brand_stock_quantity field) before request_warehouse_transfer
-- would let it declare an actual shipment — the RPC capped the requested
-- quantity at that self-reported number. That's backwards: the auditable
-- warehouse document should be the FIRST thing a brand creates when it wants
-- to send stock, not a second step gated behind a manual pre-declaration
-- nobody but the brand itself could verify. This migration removes that
-- prerequisite for ORDINARY partner replenishment while leaving every other
-- warehouse-document guarantee (idempotency, ownership, active-variant
-- membership, the receipt-is-the-only-thing-that-makes-stock-sellable rule,
-- partial receipt/damaged/missing/quarantine handling) untouched.
--
-- brand_stock_quantity is NOT removed and is NOT stripped of all meaning:
-- one legitimate, system-computed use of it survives untouched — the
-- brand_fulfilled -> zakhnook_fulfilled fulfillment-mode transition cutover
-- (20260814000002_fulfillment_mode.sql's request_fulfillment_mode_transition
-- atomically snapshots a brand's existing sellable `quantity` into
-- brand_stock_quantity the moment a transition starts). A transfer request
-- created while that specific transition is open is still capped at the
-- snapshot, because that number was produced by the system itself, not
-- self-reported by the brand — capping against it is a legitimate cutover
-- safety check, not the "held by your brand" prerequisite this migration
-- removes. request_warehouse_transfer already distinguishes this case via
-- the existing v_open_transition_id lookup (does this brand have an open
-- brand_fulfilled -> zakhnook_fulfilled transition?) — this migration just
-- branches the brand_stock_quantity check on that same value instead of
-- applying it unconditionally, and mirrors the same branch on the receiving
-- side (private.receive_warehouse_document_canonical) so a transition-linked
-- document still correctly decrements the snapshot at receipt while an
-- ordinary replenishment document never touches brand_stock_quantity at all.
--
-- Per this branch's own instructions: existing migrations are never edited.
-- Both functions below are re-declared here with their EXACT original
-- signatures (this repo's established layering convention — see e.g. how
-- apply_warehouse_stock_correction/set_warehouse_brand_stock were extended
-- in 20260814000005_inventory_permission_boundaries.sql) — every existing
-- caller (app/api/brand-portal/warehouse/transfers/route.ts,
-- public.receive_warehouse_transfer/receive_warehouse_return/
-- receive_warehouse_document's thin wrappers) keeps working unchanged.
-- ============================================================================

create or replace function public.request_warehouse_transfer(
  p_brand_id uuid,
  p_actor_id uuid,
  p_items jsonb,
  p_note text,
  p_operation_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_partner boolean;
  v_open_transition_id uuid;
  v_existing record;
  v_transfer_id uuid;
  v_item jsonb;
  v_variant record;
  v_lock record;
  v_requested integer;
  v_already_pending integer;
  v_input_count integer;
  v_distinct_count integer;
  v_matched_count integer;
  v_active_count integer;
  v_document_number text;
begin
  if nullif(pg_catalog.btrim(p_operation_key), '') is null
     or length(p_operation_key) > 160 then
    raise exception 'INVALID_OPERATION_KEY';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'TRANSFER_ITEMS_REQUIRED';
  end if;

  select count(*), count(distinct input.value->>'variant_id')
  into v_input_count, v_distinct_count
  from jsonb_array_elements(p_items) as input(value);
  if v_distinct_count <> v_input_count then
    raise exception 'DUPLICATE_OR_INVALID_VARIANT';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) as input(value)
  loop
    v_requested := (v_item->>'requested_qty')::integer;
    if v_requested is null or v_requested <= 0 then
      raise exception 'INVALID_REQUESTED_QUANTITY';
    end if;
    if nullif(v_item->>'unit_cost', '') is not null
       and (v_item->>'unit_cost')::numeric < 0 then
      raise exception 'INVALID_UNIT_COST';
    end if;
  end loop;

  select is_mahaly_partner into v_is_partner
  from public.brands where id = p_brand_id for update;
  if v_is_partner is null then raise exception 'BRAND_NOT_FOUND'; end if;

  -- Item 5 (second corrective pass, unchanged): a brand mid zakhnook_fulfilled ->
  -- brand_fulfilled transition is still is_mahaly_partner = true (that
  -- only flips at activation), but creating a NEW inbound Stock Transfer
  -- Note during that window actively works against the transition — it
  -- adds MORE stock that must then be resolved (sold through or returned)
  -- before the brand can actually leave partner mode. Blocked outright,
  -- regardless of is_mahaly_partner.
  if exists (
    select 1 from public.brand_fulfillment_transitions
    where brand_id = p_brand_id and to_mode = 'brand_fulfilled'
      and status not in ('completed', 'cancelled', 'failed')
  ) then
    raise exception 'FULFILLMENT_TRANSITION_IN_PROGRESS: cannot request a new inbound transfer while leaving Zakhnook fulfillment';
  end if;

  select id into v_open_transition_id
  from public.brand_fulfillment_transitions
  where brand_id = p_brand_id and to_mode = 'zakhnook_fulfilled'
    and status not in ('completed', 'cancelled', 'failed')
  limit 1;

  if not v_is_partner and v_open_transition_id is null then
    raise exception 'BRAND_NOT_PARTNER';
  end if;

  select id, brand_id, direction, request_payload into v_existing
  from public.warehouse_transfers
  where operation_key = p_operation_key;
  if v_existing.id is not null then
    if v_existing.brand_id <> p_brand_id
       or v_existing.direction <> 'to_local'
       or (v_existing.request_payload is not null and v_existing.request_payload <> p_items) then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return v_existing.id;
  end if;

  -- Ownership check, unchanged: every submitted variant must belong to this
  -- brand.
  select count(*) into v_matched_count
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  join jsonb_array_elements(p_items) as input(value)
    on pv.id = (input.value->>'variant_id')::uuid
  where p.brand_id = p_brand_id;
  if v_matched_count <> v_input_count then
    raise exception 'VARIANT_NOT_FOUND_FOR_BRAND';
  end if;

  -- New: a submitted replenishment request must contain only that brand's
  -- ACTIVE variants — an archived or paused/discontinued variant was never
  -- checked before (only ownership was), so it was previously possible to
  -- request stock for a variant no longer meant to be sold.
  select count(*) into v_active_count
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  join jsonb_array_elements(p_items) as input(value)
    on pv.id = (input.value->>'variant_id')::uuid
  where p.brand_id = p_brand_id
    and pv.is_archived = false
    and pv.selling_status = 'active';
  if v_active_count <> v_input_count then
    raise exception 'VARIANT_NOT_ACTIVE_FOR_BRAND';
  end if;

  for v_lock in
    select pv.id
    from public.product_variants pv
    join jsonb_array_elements(p_items) as input(value)
      on pv.id = (input.value->>'variant_id')::uuid
    order by pv.id
    for update of pv
  loop
    null;
  end loop;

  v_document_number := public.next_warehouse_document_number('to_local');

  insert into public.warehouse_transfers (
    brand_id, requested_by, brand_note, operation_key, direction,
    request_payload, document_number, document_type, related_fulfillment_transition_id
  ) values (
    p_brand_id, p_actor_id, nullif(pg_catalog.btrim(p_note), ''),
    p_operation_key, 'to_local', p_items, v_document_number, 'stock_transfer_note', v_open_transition_id
  ) returning id into v_transfer_id;

  for v_item in
    select value
    from jsonb_array_elements(p_items) as input(value)
    order by (value->>'variant_id')::uuid
  loop
    v_requested := (v_item->>'requested_qty')::integer;

    if v_open_transition_id is not null then
      -- Transition cutover shipment: still capped at the transition's own
      -- system-computed snapshot in brand_stock_quantity
      -- (request_fulfillment_mode_transition moved the brand's live
      -- `quantity` there atomically the moment the transition started).
      -- This is NOT the self-reported "held by your brand" prerequisite
      -- being removed below — it's a controlled number the system itself
      -- produced, so capping the request against it here remains a
      -- legitimate cutover safety check.
      select id, brand_stock_quantity into v_variant
      from public.product_variants
      where id = (v_item->>'variant_id')::uuid;

      -- Allocated-but-not-yet-reconciled quantity across EVERY nonterminal
      -- document status, counting only unreconciled lines — unchanged from
      -- before.
      select coalesce(sum(wti.requested_qty), 0) into v_already_pending
      from public.warehouse_transfer_items wti
      join public.warehouse_transfers wt on wt.id = wti.transfer_id
      where wti.variant_id = v_variant.id
        and wt.direction = 'to_local'
        and wt.status not in ('received', 'rejected', 'cancelled')
        and wti.received_ok_qty is null;

      if v_requested > v_variant.brand_stock_quantity - v_already_pending then
        raise exception 'INSUFFICIENT_BRAND_STOCK';
      end if;
    else
      -- Item 1 (this migration): ordinary partner replenishment no longer
      -- requires the brand to have first declared/edited
      -- product_variants.brand_stock_quantity. The request is purely a
      -- declaration of what is being shipped — Zakhnook's own receipt is
      -- now the only thing that can ever increase live sellable stock (see
      -- private.receive_warehouse_document_canonical below), so there is
      -- nothing unsafe about accepting the declaration without a
      -- pre-existing "held stock" number to check it against.
      select id into v_variant
      from public.product_variants
      where id = (v_item->>'variant_id')::uuid;
    end if;

    insert into public.warehouse_transfer_items (
      transfer_id, variant_id, requested_qty, unit_cost, item_note
    ) values (
      v_transfer_id, v_variant.id, v_requested,
      nullif(v_item->>'unit_cost', '')::numeric,
      nullif(pg_catalog.btrim(v_item->>'item_note'), '')
    );
  end loop;

  return v_transfer_id;
end;
$$;

revoke all on function public.request_warehouse_transfer(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.request_warehouse_transfer(uuid, uuid, jsonb, text, text) to service_role;

-- ============================================================================
-- private.receive_warehouse_document_canonical — re-declared with the exact
-- original signature. Only the 'to_local' branch's brand_stock_quantity
-- handling changes: it now only reads/decrements brand_stock_quantity when
-- the document is linked to a fulfillment-mode transition
-- (related_fulfillment_transition_id is not null) — an ordinary partner
-- replenishment document (the normal case going forward) never touches
-- brand_stock_quantity at all, at request OR receipt. Everything else
-- (reconciliation math, partial receiving, discrepancy/quarantine handling,
-- the 'to_brand' branch, idempotent status-history writes) is byte-identical
-- to the current version.
-- ============================================================================
create or replace function private.receive_warehouse_document_canonical(
  p_transfer_id uuid,
  p_actor_id uuid,
  p_items jsonb,
  p_note text,
  p_expected_direction text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer record;
  v_input_count integer;
  v_distinct_count integer;
  v_matched_count integer;
  v_unreconciled_count integer;
  v_already_reconciled_count integer;
  v_remaining_after integer;
  v_item_row record;
  v_variant record;
  v_lock record;
  v_ok integer;
  v_damaged integer;
  v_missing integer;
  v_new_quantity integer;
  v_new_brand_stock integer;
  v_has_discrepancy boolean := false;
  v_results jsonb := '[]'::jsonb;
  v_final_status text;
begin
  if p_expected_direction not in ('to_local', 'to_brand') then
    raise exception 'INVALID_TRANSFER_DIRECTION';
  end if;

  select id, brand_id, status, direction, stock_reserved_at, has_discrepancy,
         related_fulfillment_transition_id into v_transfer
  from public.warehouse_transfers
  where id = p_transfer_id
  for update;
  if v_transfer.id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_transfer.direction <> p_expected_direction then raise exception 'TRANSFER_DIRECTION_MISMATCH'; end if;
  if v_transfer.status not in ('pending', 'submitted', 'approved', 'in_transit', 'partially_received') then
    raise exception 'TRANSFER_ALREADY_DECIDED';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'TRANSFER_ITEMS_REQUIRED';
  end if;

  select count(*), count(distinct input.value->>'item_id')
  into v_input_count, v_distinct_count
  from jsonb_array_elements(p_items) as input(value);
  if v_distinct_count <> v_input_count then
    raise exception 'DUPLICATE_OR_INVALID_TRANSFER_ITEM';
  end if;

  -- Every submitted item must belong to this document and not already be
  -- reconciled from an earlier partial call.
  select count(*) into v_matched_count
  from public.warehouse_transfer_items wti
  join jsonb_array_elements(p_items) as input(value)
    on wti.id = (input.value->>'item_id')::uuid
  where wti.transfer_id = p_transfer_id and wti.received_ok_qty is null;
  if v_matched_count <> v_input_count then
    raise exception 'TRANSFER_ITEM_NOT_FOUND_OR_ALREADY_RECONCILED';
  end if;

  for v_lock in
    select pv.id
    from public.product_variants pv
    join public.warehouse_transfer_items wti on wti.variant_id = pv.id
    join jsonb_array_elements(p_items) as input(value) on wti.id = (input.value->>'item_id')::uuid
    where wti.transfer_id = p_transfer_id
    order by pv.id
    for update of pv
  loop
    null;
  end loop;

  for v_item_row in
    select wti.id, wti.variant_id, wti.requested_qty, submitted.payload
    from public.warehouse_transfer_items wti
    join lateral (
      select input.value as payload
      from jsonb_array_elements(p_items) as input(value)
      where input.value->>'item_id' = wti.id::text
    ) submitted on true
    where wti.transfer_id = p_transfer_id
    order by wti.id
  loop
    v_ok := coalesce((v_item_row.payload->>'received_ok_qty')::integer, 0);
    v_damaged := coalesce((v_item_row.payload->>'damaged_qty')::integer, 0);
    v_missing := coalesce((v_item_row.payload->>'missing_qty')::integer, 0);
    if v_ok < 0 or v_damaged < 0 or v_missing < 0 then
      raise exception 'INVALID_RECONCILIATION_QUANTITY';
    end if;
    if v_ok + v_damaged + v_missing <> v_item_row.requested_qty then
      raise exception 'TRANSFER_ITEM_NOT_RECONCILED';
    end if;
    if v_damaged > 0 or v_missing > 0 then v_has_discrepancy := true; end if;

    select id, quantity, product_id, brand_stock_quantity into v_variant
    from public.product_variants where id = v_item_row.variant_id;

    if p_expected_direction = 'to_local' then
      if v_transfer.related_fulfillment_transition_id is not null then
        -- Transition-linked document: brand_stock_quantity holds this
        -- transition's own cutover snapshot — decrement it exactly as
        -- before, unchanged.
        if v_variant.brand_stock_quantity < v_item_row.requested_qty then
          raise exception 'INSUFFICIENT_BRAND_STOCK_AT_RECEIPT';
        end if;
        v_new_brand_stock := v_variant.brand_stock_quantity - v_item_row.requested_qty;
      else
        -- Ordinary partner replenishment (this migration's change):
        -- brand_stock_quantity was never checked or touched at request
        -- time for this document, so it is never touched at receipt
        -- either — leaving it exactly as it already is.
        v_new_brand_stock := v_variant.brand_stock_quantity;
      end if;
      v_new_quantity := v_variant.quantity + v_ok;
    else
      if v_transfer.stock_reserved_at is null then
        if v_variant.quantity < v_item_row.requested_qty then
          raise exception 'INSUFFICIENT_SELLABLE_STOCK_AT_RETURN';
        end if;
        v_new_quantity := v_variant.quantity - v_item_row.requested_qty;
      else
        v_new_quantity := v_variant.quantity;
      end if;
      v_new_brand_stock := v_variant.brand_stock_quantity + v_ok;
    end if;

    update public.product_variants
    set quantity = v_new_quantity,
        brand_stock_quantity = v_new_brand_stock,
        updated_at = now()
    where id = v_variant.id;

    if v_new_quantity <> v_variant.quantity then
      insert into public.inventory_movements (
        variant_id, product_id, brand_id, previous_quantity, quantity_delta,
        new_quantity, movement_type, reason, note, created_by, source,
        source_operation_key, from_location, to_location,
        related_entity_type, related_entity_id
      ) values (
        v_variant.id, v_variant.product_id, v_transfer.brand_id,
        v_variant.quantity, v_new_quantity - v_variant.quantity,
        v_new_quantity, 'warehouse_transfer_received',
        case when p_expected_direction = 'to_brand'
          then 'Stock Return Note received'
          else 'Goods Receipt Note received'
        end,
        nullif(pg_catalog.btrim(v_item_row.payload->>'item_note'), ''),
        p_actor_id, 'warehouse_transfer',
        case when p_expected_direction = 'to_brand'
          then 'warehouse-return:' || p_transfer_id::text || ':' || v_item_row.id::text
          else 'warehouse-transfer:' || p_transfer_id::text || ':' || v_item_row.id::text
        end,
        case when p_expected_direction = 'to_local' then 'in_transit_to_zakhnook' else 'zakhnook_available' end,
        case when p_expected_direction = 'to_local' then 'zakhnook_available' else 'returned_to_brand' end,
        'warehouse_document', p_transfer_id
      );
    end if;

    if v_damaged > 0 or v_missing > 0 then
      insert into public.inventory_movements (
        variant_id, product_id, brand_id, previous_quantity, quantity_delta,
        new_quantity, movement_type, reason, note, created_by, source,
        source_operation_key, from_location, to_location,
        related_entity_type, related_entity_id
      ) values (
        v_variant.id, v_variant.product_id, v_transfer.brand_id, 0, 0, 0,
        'warehouse_quarantine_hold', 'Damaged/missing units held in quarantine',
        nullif(pg_catalog.btrim(v_item_row.payload->>'item_note'), ''), p_actor_id,
        'warehouse_transfer',
        'warehouse-quarantine:' || p_transfer_id::text || ':' || v_item_row.id::text,
        case when p_expected_direction = 'to_local' then 'in_transit_to_zakhnook' else 'zakhnook_available' end,
        'zakhnook_quarantine', 'warehouse_document', p_transfer_id
      );
    end if;

    update public.warehouse_transfer_items
    set received_ok_qty = v_ok,
        damaged_qty = v_damaged,
        missing_qty = v_missing,
        item_note = coalesce(
          nullif(pg_catalog.btrim(v_item_row.payload->>'item_note'), ''),
          item_note
        )
    where id = v_item_row.id;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'variant_id', v_variant.id,
      'received_ok_qty', v_ok,
      'damaged_qty', v_damaged,
      'missing_qty', v_missing,
      'new_quantity', v_new_quantity
    ));
  end loop;

  select count(*) into v_remaining_after
  from public.warehouse_transfer_items
  where transfer_id = p_transfer_id and received_ok_qty is null;

  v_final_status := case when v_remaining_after = 0 then 'received' else 'partially_received' end;

  update public.warehouse_transfers
  set status = v_final_status,
      decided_by = case when v_final_status = 'received' then p_actor_id else decided_by end,
      decided_at = case when v_final_status = 'received' then now() else decided_at end,
      receiving_note = coalesce(nullif(pg_catalog.btrim(p_note), ''), receiving_note),
      has_discrepancy = has_discrepancy or v_has_discrepancy,
      updated_at = now()
  where id = p_transfer_id;

  return jsonb_build_object('items', v_results, 'status', v_final_status, 'remaining_unreconciled', v_remaining_after);
end;
$$;

revoke all on function private.receive_warehouse_document_canonical(uuid, uuid, jsonb, text, text)
  from public, anon, authenticated, service_role;

-- ============================================================================
-- Read model: public.brand_portal_inventory_page
--
-- Supersedes the narrower brand_portal_replenishment_variants draft this
-- migration originally shipped with (never applied to any database, so
-- freely replaced in place rather than layered — see this migration's own
-- file header). The grouped partner Inventory UI (Product -> Color -> Size,
-- components/brand-portal/InventoryManager.tsx) needs far more per-variant
-- context than a bare replenishment-request helper: sales/insight fields,
-- resolved images, and health-card summary counts, all without loading a
-- brand's entire catalog into the Next.js server or the browser.
--
-- PAGINATION UNIT IS THE PRODUCT, NOT THE VARIANT. Search/stock-status
-- filtering still happens at variant granularity (matches the prior
-- unpaginated getVariantsForBrand behavior exactly — a filtered view can
-- legitimately show only some of a product's variants), but the page
-- boundary always falls on a product edge: every matching variant of any
-- product included on a page is present on that SAME page, so a product
-- (and therefore every color/size group inside it) is never split across
-- two pages. This is what "product group" cursor pagination means here —
-- concretely: variants are matched/filtered first, matching variants are
-- rolled up by product for sort-key computation and page-boundary
-- decisions, then every matching variant belonging to a page's chosen
-- products is expanded back out as this response's flat `items` list (an
-- "equivalent contract" to returning products with nested groups — the
-- client already re-nests a flat variant list into Product -> Color -> Size
-- groups via InventoryManager.tsx's buildVariantGroups, so a flat,
-- completely-grouped list is both correct and avoids a UI rewrite).
--
-- Cursor: p_cursor is a small jsonb object {"productId": text, "sortValue":
-- text} — opaque to the caller, echoed back verbatim from the previous
-- page's last PRODUCT. Never OFFSET (would rescan/skip rows under
-- concurrent writes) — a keyset (sort value, product_id) comparison, with
-- product_id as a fixed ascending tiebreaker regardless of the primary
-- sort's own direction, so replaying the same cursor always yields the
-- same next page. p_sort/p_stock_status are validated against a fixed
-- allowlist BEFORE being used to select a sort branch below — never
-- string-interpolated into SQL text.
--
-- Sort semantics mirror the five concrete options the Inventory page's own
-- <select> already offers (no arbitrary asc/desc matrix): 'risk' (most
-- urgent first — the MINIMUM per-variant risk score among a product's
-- matching variants), 'sales' (best-selling first — SUM of soldLast30Days
-- across a product's matching variants), 'name' (product name, A-Z),
-- 'stock_asc'/'stock_desc' (SUM of availableAtZakhnook across a product's
-- matching variants). Summing/MIN-ing per product mirrors exactly what the
-- UI's own per-product aggregate row already displays (stockGroupSummary in
-- InventoryManager.tsx), so the sort order matches what a user actually
-- sees on each product's own summary row.
--
-- estimatedDaysRemaining/suggestedRestock/riskScore mirror
-- lib/inventory/brandInventoryInsights.ts's TypeScript formulas exactly
-- (kept in sync by hand — that file remains the source of truth for any
-- future formula change, since the brand-adjustment UI paths still compute
-- these client-side from raw numbers in other views). riskScore's
-- "out of stock" sentinel (TypeScript: Number.NEGATIVE_INFINITY) is
-- represented here as -1, a value strictly below every other possible
-- finite score (which is always >= 0), since JSON has no Infinity.
-- ============================================================================
create or replace function public.brand_portal_inventory_page(
  p_brand_id uuid,
  p_search text default null,
  p_stock_status text default 'all',
  p_sort text default 'risk',
  p_cursor jsonb default null,
  p_page_size integer default 10,
  p_product_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page_size integer;
  v_search text;
  v_cursor_product_id text;
  v_cursor_sort_value text;
  v_result jsonb;
begin
  if p_brand_id is null then raise exception 'BRAND_ID_REQUIRED'; end if;
  if p_stock_status not in ('all', 'in_stock', 'low_stock', 'out_of_stock') then
    raise exception 'INVALID_STOCK_STATUS_FILTER';
  end if;
  if p_sort not in ('risk', 'sales', 'name', 'stock_asc', 'stock_desc') then
    raise exception 'INVALID_SORT';
  end if;
  if p_cursor is not null and (p_cursor->>'productId' is null or p_cursor->>'sortValue' is null) then
    raise exception 'INVALID_CURSOR';
  end if;

  v_page_size := greatest(1, least(coalesce(p_page_size, 10), 50));
  -- Escape ILIKE metacharacters in the search term so a literal '%'/'_'
  -- searches for that literal character rather than acting as a wildcard.
  v_search := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  if v_search is not null then
    v_search := replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_');
  end if;
  v_cursor_product_id := p_cursor->>'productId';
  v_cursor_sort_value := p_cursor->>'sortValue';

  with eligible_raw as (
    -- Every active, non-archived variant for this brand, with every field
    -- the grouped Inventory UI needs, computed ONCE and reused for both
    -- the UNFILTERED summary counts (health cards) and the filtered/
    -- paginated page — a large brand's catalog is scanned here at most
    -- once per request, never once per page navigation click on top of a
    -- separate unbounded load.
    select
      pv.id as variant_id,
      pv.product_id,
      p.name as product_name,
      pv.sku,
      pv.selling_status,
      pv.quantity as available_at_zakhnook,
      coalesce(pv.low_stock_threshold_override, p.default_low_stock_threshold) as low_stock_threshold,
      coalesce(incoming.incoming_quantity, 0)::integer as incoming_quantity,
      color_value.label as color,
      color_value.sort_order as color_sort_order,
      size_value.label as size,
      size_value.sort_order as size_sort_order,
      coalesce(color_media.storage_reference, p.image) as image,
      coalesce(sales.sold_last_30_days, 0)::integer as sold_last_30_days,
      latest.transfer_id as latest_transfer_id,
      latest.document_number as latest_document_number,
      latest.status as latest_status,
      latest.requested_at as latest_requested_at,
      latest.requested_qty as latest_requested_qty,
      latest.is_open as latest_is_open
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    left join lateral (
      select ov.label, ov.sort_order
      from public.product_variant_values pvv
      join public.option_values ov on ov.id = pvv.option_value_id
      join public.option_types ot on ot.id = ov.option_type_id
      where pvv.variant_id = pv.id and ot.name = 'Color'
      limit 1
    ) color_value on true
    left join lateral (
      select ov.label, ov.sort_order
      from public.product_variant_values pvv
      join public.option_values ov on ov.id = pvv.option_value_id
      join public.option_types ot on ot.id = ov.option_type_id
      where pvv.variant_id = pv.id and ot.name = 'Size'
      limit 1
    ) size_value on true
    left join lateral (
      select pm.storage_reference
      from public.product_variant_values pvv
      join public.product_media pm
        on pm.product_id = pv.product_id and pm.color_option_value_id = pvv.option_value_id
      where pvv.variant_id = pv.id and pm.is_archived = false
      order by pm.display_order
      limit 1
    ) color_media on true
    left join lateral (
      select coalesce(sum(oi.quantity), 0) as sold_last_30_days
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.variant_id = pv.id
        and o.created_at >= now() - interval '30 days'
        and o.status <> 'cancelled'
    ) sales on true
    left join lateral (
      select coalesce(sum(wti.requested_qty), 0) as incoming_quantity
      from public.warehouse_transfer_items wti
      join public.warehouse_transfers wt on wt.id = wti.transfer_id
      where wti.variant_id = pv.id
        and wt.direction = 'to_local'
        and wt.status not in ('received', 'rejected', 'cancelled')
        and wti.received_ok_qty is null
    ) incoming on true
    left join lateral (
      select
        wt.id as transfer_id,
        wt.document_number,
        wt.status,
        wt.requested_at,
        wti.requested_qty,
        (wt.status not in ('received', 'rejected', 'cancelled')) as is_open
      from public.warehouse_transfer_items wti
      join public.warehouse_transfers wt on wt.id = wti.transfer_id
      where wti.variant_id = pv.id and wt.direction = 'to_local'
      order by (wt.status not in ('received', 'rejected', 'cancelled')) desc, wt.requested_at desc
      limit 1
    ) latest on true
    where p.brand_id = p_brand_id
      and pv.is_archived = false
  ),
  eligible as (
    -- Second pass: derive stock_status/estimatedDaysRemaining/
    -- suggestedRestock/riskScore from eligible_raw's own columns (a SELECT
    -- list cannot reference its own sibling aliases, hence the two-step
    -- CTE) — every formula here is the SQL mirror of
    -- lib/inventory/brandInventoryInsights.ts, see this section's header.
    select
      r.*,
      case
        when r.available_at_zakhnook <= 0 then 'out_of_stock'
        when r.available_at_zakhnook <= r.low_stock_threshold then 'low_stock'
        else 'in_stock'
      end as stock_status,
      case when r.sold_last_30_days > 0
        then greatest(0, round((r.available_at_zakhnook::numeric / (r.sold_last_30_days::numeric / 30.0)) * 10) / 10)
        else null
      end as estimated_days_remaining,
      greatest(
        0,
        greatest(r.sold_last_30_days + r.low_stock_threshold, r.low_stock_threshold * 2) - r.available_at_zakhnook
      )::integer as suggested_restock,
      case
        when r.available_at_zakhnook <= 0 then -1
        when r.sold_last_30_days > 0
          then greatest(0, round((r.available_at_zakhnook::numeric / (r.sold_last_30_days::numeric / 30.0)) * 10) / 10)
        when r.available_at_zakhnook <= r.low_stock_threshold then 10000 + r.available_at_zakhnook
        else 20000 + r.available_at_zakhnook
      end as risk_score
    from eligible_raw r
  ),
  matching as (
    -- Search/stock-status filtering happens at VARIANT granularity, exactly
    -- like the unpaginated view it replaces — a search or "Low stock" filter
    -- can legitimately show only some of a product's variants.
    -- p_product_id narrows to a single product (components/admin/ProductForm.tsx's
    -- "View inventory" deep link, `?product=<id>`) — kept as a plain equality
    -- filter here rather than a separate RPC, so that deep link still gets
    -- the exact same computed fields/summary shape as every other view.
    select e.*
    from eligible e
    where
      (p_stock_status = 'all' or e.stock_status = p_stock_status)
      and (p_product_id is null or e.product_id = p_product_id)
      and (
        v_search is null
        or (e.product_name || ' ' || coalesce(e.color, '') || ' ' || coalesce(e.size, '') || ' ' || e.sku)
          ilike '%' || v_search || '%' escape '\'
      )
  ),
  product_rollup as (
    -- The PAGINATION/sort unit: one row per product that still has at
    -- least one matching variant, with the aggregate values that decide
    -- sort order (mirroring InventoryManager.tsx's own per-product summary
    -- row math exactly, so sort order matches what a user sees).
    select
      product_id,
      min(product_name) as product_name,
      sum(available_at_zakhnook) as stock_key,
      sum(sold_last_30_days) as sales_key,
      min(risk_score) as risk_key
    from matching
    group by product_id
  ),
  scored_products as (
    select
      product_id,
      product_name,
      case p_sort
        when 'risk' then risk_key
        when 'sales' then sales_key
        when 'stock_asc' then stock_key
        when 'stock_desc' then stock_key
        else null
      end as sort_numeric,
      case when p_sort = 'name' then product_name else null end as sort_text
    from product_rollup
  ),
  paged_products as (
    select
      sp.*,
      coalesce(sp.sort_text, sp.sort_numeric::text) as cursor_sort_value,
      row_number() over (
        order by
          case when p_sort = 'name' then sp.sort_text end asc,
          case when p_sort = 'sales' then sp.sort_numeric end desc,
          case when p_sort = 'stock_desc' then sp.sort_numeric end desc,
          case when p_sort in ('risk', 'stock_asc') then sp.sort_numeric end asc,
          sp.product_id asc
      ) as rn
    from scored_products sp
    where
      v_cursor_product_id is null
      or (
        case
          when p_sort = 'name' then
            (sp.sort_text > v_cursor_sort_value)
            or (sp.sort_text = v_cursor_sort_value and sp.product_id > v_cursor_product_id)
          when p_sort in ('sales', 'stock_desc') then
            (sp.sort_numeric < v_cursor_sort_value::numeric)
            or (sp.sort_numeric = v_cursor_sort_value::numeric and sp.product_id > v_cursor_product_id)
          else
            (sp.sort_numeric > v_cursor_sort_value::numeric)
            or (sp.sort_numeric = v_cursor_sort_value::numeric and sp.product_id > v_cursor_product_id)
        end
      )
    order by
      case when p_sort = 'name' then sp.sort_text end asc,
      case when p_sort = 'sales' then sp.sort_numeric end desc,
      case when p_sort = 'stock_desc' then sp.sort_numeric end desc,
      case when p_sort in ('risk', 'stock_asc') then sp.sort_numeric end asc,
      sp.product_id asc
    limit v_page_size + 1
  ),
  final_products as (
    select * from paged_products where rn <= v_page_size
  ),
  page_meta as (
    select
      exists(select 1 from paged_products where rn = v_page_size + 1) as has_more,
      (select cursor_sort_value from final_products order by rn desc limit 1) as last_sort_value,
      (select product_id from final_products order by rn desc limit 1) as last_product_id
  ),
  items_ordered as (
    -- Deterministic within-product order: color by its own catalog
    -- sort_order (falls back to label so an unconfigured sort_order of 0
    -- for every color still yields a stable alphabetical order), then size
    -- the same way, then variant id as a final tiebreaker — so repeated
    -- requests for the same page always render identically.
    select m.*, fp.rn
    from matching m
    join final_products fp using (product_id)
    order by
      fp.rn,
      m.color_sort_order nulls first, m.color nulls first,
      m.size_sort_order nulls first, m.size nulls first,
      m.variant_id
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'variantId', io.variant_id,
        'productId', io.product_id,
        'productName', io.product_name,
        'image', nullif(io.image, ''),
        'color', io.color,
        'size', io.size,
        'sku', io.sku,
        'availableAtZakhnook', io.available_at_zakhnook,
        'incomingQuantity', io.incoming_quantity,
        'lowStockThreshold', io.low_stock_threshold,
        'stockStatus', io.stock_status,
        'soldLast30Days', io.sold_last_30_days,
        'estimatedDaysRemaining', io.estimated_days_remaining,
        'suggestedRestock', io.suggested_restock,
        'sellingStatus', io.selling_status,
        'latestRequest', case when io.latest_transfer_id is null then null else jsonb_build_object(
          'transferId', io.latest_transfer_id,
          'documentNumber', io.latest_document_number,
          'status', io.latest_status,
          'requestedAt', io.latest_requested_at,
          'requestedQty', io.latest_requested_qty,
          'isOpen', io.latest_is_open
        ) end
      ) order by io.rn,
        io.color_sort_order nulls first, io.color nulls first,
        io.size_sort_order nulls first, io.size nulls first,
        io.variant_id)
      from items_ordered io
    ), '[]'::jsonb),
    'nextCursor', case
      when (select has_more from page_meta) and (select last_product_id from page_meta) is not null
        then jsonb_build_object('productId', (select last_product_id from page_meta), 'sortValue', (select last_sort_value from page_meta))
      else null
    end,
    'hasMore', coalesce((select has_more from page_meta), false),
    'summary', jsonb_build_object(
      'totalVariantCount', (select count(*) from eligible),
      'totalAvailableUnits', (select coalesce(sum(available_at_zakhnook), 0) from eligible),
      'healthyCount', (select count(*) from eligible where stock_status = 'in_stock'),
      'lowStockCount', (select count(*) from eligible where stock_status = 'low_stock'),
      'outOfStockCount', (select count(*) from eligible where stock_status = 'out_of_stock'),
      'matchingResultCount', (select count(*) from matching)
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.brand_portal_inventory_page(uuid, text, text, text, jsonb, integer, text)
  from public, anon, authenticated;
grant execute on function public.brand_portal_inventory_page(uuid, text, text, text, jsonb, integer, text)
  to service_role;
