-- Production bug, reported live: archived products were still showing up
-- in the Brand Portal Inventory page (/brand-portal/stock).
--
-- Root cause: public.brand_portal_inventory_page's eligible_raw CTE filters
-- on `pv.is_archived = false` (the VARIANT's own archive flag) but never
-- checked `p.status` (the PRODUCT's own lifecycle status). Archiving a
-- product (private.enforce_archived_product_transition,
-- 20260814020000_product_deletion_lifecycle.sql) sets products.status =
-- 'archived' and clears paused_by_brand/deletion_requested_at, but does
-- NOT cascade is_archived = true down to the product's variants — variant-
-- level is_archived is a distinct concept (used for e.g. discontinuing one
-- color while the rest of the product stays live) from product-level
-- Archived (a terminal, whole-product state). So an archived product's
-- still-not-individually-archived variants kept matching this query and
-- kept appearing in Inventory, which makes no sense for a product that's
-- terminal and can never be sold again.
--
-- Re-declared with two changes from the prior version:
--   1. One added condition in eligible_raw's WHERE clause:
--      `and p.status <> 'archived'` (this migration's main fix).
--   2. A second bug found in the same audit: InventoryManager.tsx's
--      collapsed, top-level PRODUCT row used `variant.image` from
--      whichever variant/color happened to sort first (color_sort_order),
--      not the product's own designated cover photo — so a product whose
--      first-sorted color has its own dedicated photo would silently show
--      that color's photo instead of the true cover on the collapsed row,
--      while still being byte-correct once expanded to the per-color rows.
--      Fixed by additionally exposing the raw, unconditional `p.image` as
--      its own `productImage` field (never falling back to a color photo),
--      alongside the existing per-variant/color `image` field (still
--      color-aware, coalesced to the cover only when that color has no
--      dedicated photo) — the client now uses `productImage` for the
--      collapsed row and `image` for the expanded color/size rows, so
--      each level of the table shows the photo that's actually correct
--      for what it represents.
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
    -- Every active, non-archived variant of a non-archived product for
    -- this brand, with every field the grouped Inventory UI needs,
    -- computed ONCE and reused for both the UNFILTERED summary counts
    -- (health cards) and the filtered/paginated page — a large brand's
    -- catalog is scanned here at most once per request, never once per
    -- page navigation click on top of a separate unbounded load.
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
      p.image as product_cover_image,
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
      and p.status <> 'archived'
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
        'productImage', nullif(io.product_cover_image, ''),
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
