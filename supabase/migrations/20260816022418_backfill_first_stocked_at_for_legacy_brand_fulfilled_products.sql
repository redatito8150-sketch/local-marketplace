-- Production data fix, reported live: "Ghost" (SKU GG-000001), a
-- brand_fulfilled product with 25 real units currently in stock across 3
-- variants, was showing the new "Coming Soon" badge (lib/brandProfile.ts's
-- productCardBadge) instead of its correct state (New/Offer/none) because
-- products.first_stocked_at was still null for it.
--
-- Root cause: 20260814000004_product_launch_state.sql's backfill only ever
-- targeted zakhnook_fulfilled brands (`b.fulfillment_mode =
-- 'zakhnook_fulfilled'`), on the assumption that every brand_fulfilled
-- product already gets first_stocked_at stamped immediately at creation
-- (true for products created through the current create_variant_with_
-- opening_stock + Inventory-only-stock-entry flow) — but that assumption
-- does not hold for products that already existed, with real stock, BEFORE
-- that flow existed at all (seeded/legacy catalog data). Those products
-- never went through any write path that would have stamped the column,
-- so it silently stayed null forever despite genuinely having stock.
--
-- This backfill is the same shape as the original, widened to run for
-- EVERY brand regardless of fulfillment_mode (dropping the `b.fulfillment_
-- mode = 'zakhnook_fulfilled'` restriction), and broadened to recognize
-- any historical 0->positive inventory_movements row as evidence (not just
-- 'warehouse_transfer_received', which is specific to Zakhnook's own
-- warehouse flow and would never exist for a brand_fulfilled product).
-- Guarded identically to the original: only ever sets a currently-null
-- column, only for a product with real evidence of stock (current positive
-- quantity on a live variant, or historical evidence of a movement that
-- landed positive stock) — never a fabricated date, never re-run
-- destructively, and never touches a product that's genuinely never been
-- stocked (which correctly keeps first_stocked_at null and stays Coming
-- Soon, exactly as intended).
update public.products p
set first_stocked_at = coalesce(
  (
    select min(im.created_at)
    from public.inventory_movements im
    where im.product_id = p.id
      and im.previous_quantity = 0
      and im.new_quantity > 0
  ),
  now()
)
where p.first_stocked_at is null
  and (
    exists (
      select 1
      from public.inventory_movements im
      where im.product_id = p.id
        and im.previous_quantity = 0
        and im.new_quantity > 0
    )
    or exists (
      select 1 from public.product_variants pv
      where pv.product_id = p.id and pv.is_archived = false and pv.quantity > 0
    )
  );
