import { NextRequest, NextResponse } from "next/server";
import { toCsv } from "@/lib/csv";
import {
  getInventoryBrandDetailForAdmin,
  getInventoryBrandSummariesForAdmin,
  getInventoryMovementsForAdmin,
} from "@/lib/data/admin";
import {
  INVENTORY_MOVEMENT_OPTIONS,
  INVENTORY_SOURCE_OPTIONS,
  inventoryMovementRouteLabels,
  inventoryMovementLabel,
  inventorySourceLabel,
} from "@/lib/inventory/movementPresentation";
import { requireAdminUser } from "@/lib/supabase/adminAuth";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EXPORT_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 10_000;

export async function GET(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const params = request.nextUrl.searchParams;
  const summaries = await getInventoryBrandSummariesForAdmin();
  const selectedBrand = params.get("brand")
    ? summaries.find((brand) => brand.slug === params.get("brand")) ?? null
    : null;
  const detail = selectedBrand ? await getInventoryBrandDetailForAdmin(selectedBrand.slug) : null;
  const selectedProduct = detail?.products.find((product) => product.id === params.get("productId"));
  const selectedVariant = detail?.products.flatMap((product) => product.variants).find((variant) => variant.id === params.get("variantId"));
  const source = INVENTORY_SOURCE_OPTIONS.some(([key]) => key === params.get("source")) ? params.get("source") ?? undefined : undefined;
  const movementType = INVENTORY_MOVEMENT_OPTIONS.some(([key]) => key === params.get("movement")) ? params.get("movement") ?? undefined : undefined;
  const from = DATE_PATTERN.test(params.get("from") ?? "") ? params.get("from") ?? undefined : undefined;
  const to = DATE_PATTERN.test(params.get("to") ?? "") ? params.get("to") ?? undefined : undefined;
  const q = params.get("q")?.trim() || undefined;

  const rows: Awaited<ReturnType<typeof getInventoryMovementsForAdmin>>["rows"] = [];
  let page = 1;
  let total = 0;
  do {
    const result = await getInventoryMovementsForAdmin({
      brand: selectedBrand?.name,
      q,
      productId: selectedProduct?.id,
      variantId: selectedVariant?.id,
      source,
      movementType,
      from,
      to,
      page,
      limit: EXPORT_PAGE_SIZE,
    });
    total = result.total;
    rows.push(...result.rows);
    page += 1;
  } while (rows.length < total && rows.length < MAX_EXPORT_ROWS);

  const csvRows = rows.slice(0, MAX_EXPORT_ROWS).map((row) => {
    const route = inventoryMovementRouteLabels(row.movementType, row.fromLocation, row.toLocation);
    return ({
    recordedAt: row.createdAt,
    brand: row.brandName,
    product: row.productName,
    variant: row.variantLabel,
    sku: row.variantSku,
    movement: inventoryMovementLabel(row.movementType),
    quantityDelta: row.quantityDelta,
    previousQuantity: row.previousQuantity,
    newQuantity: row.newQuantity,
    fromLocation: route.from ?? "",
    toLocation: route.to ?? "",
    reason: row.reason,
    note: row.note ?? "",
    source: inventorySourceLabel(row.source),
    reference: row.reference?.label ?? "",
    actor: row.actor?.displayName ?? "System",
    actorRole: row.actor?.roleLabel ?? "System",
    actorEmail: row.actor?.email ?? "",
    dataQuality: row.hasTestOrLegacyNote ? "Test or legacy note" : "Operational",
    });
  });

  const csv = toCsv(csvRows, [
    { key: "recordedAt", label: "Recorded At" },
    { key: "brand", label: "Brand" },
    { key: "product", label: "Product" },
    { key: "variant", label: "Variant" },
    { key: "sku", label: "SKU" },
    { key: "movement", label: "Movement" },
    { key: "quantityDelta", label: "Quantity Change" },
    { key: "previousQuantity", label: "Previous Quantity" },
    { key: "newQuantity", label: "New Quantity" },
    { key: "fromLocation", label: "From Location" },
    { key: "toLocation", label: "To Location" },
    { key: "reason", label: "Reason" },
    { key: "note", label: "Note" },
    { key: "source", label: "Source" },
    { key: "reference", label: "Reference" },
    { key: "actor", label: "Recorded By" },
    { key: "actorRole", label: "Actor Role" },
    { key: "actorEmail", label: "Actor Email" },
    { key: "dataQuality", label: "Data Quality" },
  ]);

  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inventory-movements-${new Date().toISOString().slice(0, 10)}.csv"`,
      "X-Exported-Rows": String(csvRows.length),
      "X-Export-Truncated": rows.length < total ? "true" : "false",
    },
  });
}
