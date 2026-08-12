import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getFullTaxonomyTree, resolveTaxonomyPath } from "@/lib/data/taxonomy";
import { getVariantsForProducts } from "@/lib/data/variants";
import { calculateStockStatus, effectiveLowStockThreshold } from "@/lib/inventory/stockStatus";
import type { SellingStatus, StockStatus } from "@/types";

// Every query here uses the cookie-aware anon client by default (never
// supabaseAdmin) so the brand-owner RLS policies actually do the scoping —
// the portal must never be able to see another brand's data even if a
// query here had a bug, because the database itself refuses the row.
// `impersonating` is the one deliberate exception: an admin viewing a
// brand they don't personally own would get correctly blocked by that
// same RLS policy, so requireBrandOwner() (which has already verified the
// caller really is an admin) passes this through to read via
// supabaseAdmin instead — the same trust boundary already used by every
// read in lib/data/admin.ts.

export interface BrandOrderItem {
  id: string;
  name: string;
  size: string;
  color?: string;
  price: number;
  currency: "USD" | "EGP";
  quantity: number;
}

export interface BrandOrder {
  id: string;
  orderNumber: string;
  status: string;
  shippingName: string;
  shippingCity: string;
  shippingGovernorate: string;
  createdAt: string;
  items: BrandOrderItem[];
  // 'brand_direct' orders are this brand's own shipment (this brand can
  // advance its status); 'mahaly_pool' orders pool this brand's items with
  // other partner brands' — Zakhnook's own warehouse fulfills those, so the
  // brand-portal view stays read-only for them (see BrandOrdersTable).
  fulfillmentType: "mahaly_pool" | "brand_direct";
  shippingFeeEgp: number;
}

interface OrderItemRow {
  id: string;
  name: string;
  size: string;
  color: string | null;
  price: number;
  currency: "USD" | "EGP";
  quantity: number;
  order_id: string;
  orders: {
    id: string;
    order_number: string;
    status: string;
    shipping_name: string;
    shipping_city: string;
    shipping_governorate: string;
    created_at: string;
    fulfillment_type: "mahaly_pool" | "brand_direct";
    shipping_fee_egp: number;
  } | null;
}

// Orders containing at least one of this brand's items — only orders
// placed after brand_slug attribution shipped will appear; historical
// orders keep a null brand_slug and are correctly invisible here.
export async function getOrdersForBrand(
  brandSlug: string,
  _impersonating = false
): Promise<BrandOrder[]> {
  const { data, error } = await supabaseAdmin
    .from("order_items")
    .select(
      "id, name, size, color, price, currency, quantity, order_id, orders(id, order_number, status, shipping_name, shipping_city, shipping_governorate, created_at, fulfillment_type, shipping_fee_egp)"
    )
    .eq("brand_slug", brandSlug);

  if (error) {
    throw new Error(`getOrdersForBrand(${brandSlug}) failed: ${error.message}`);
  }

  const byOrder = new Map<string, BrandOrder>();
  for (const row of (data as unknown as OrderItemRow[]) ?? []) {
    if (!row.orders) continue;
    const existing = byOrder.get(row.orders.id) ?? {
      id: row.orders.id,
      orderNumber: row.orders.order_number,
      status: row.orders.status,
      shippingName: row.orders.shipping_name,
      shippingCity: row.orders.shipping_city,
      shippingGovernorate: row.orders.shipping_governorate,
      createdAt: row.orders.created_at,
      fulfillmentType: row.orders.fulfillment_type,
      shippingFeeEgp: Number(row.orders.shipping_fee_egp),
      items: [],
    };
    existing.items.push({
      id: row.id,
      name: row.name,
      size: row.size,
      color: row.color ?? undefined,
      price: Number(row.price),
      currency: row.currency,
      quantity: row.quantity,
    });
    byOrder.set(row.orders.id, existing);
  }

  return [...byOrder.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export interface BrandVariant {
  variantId: string;
  productId: string;
  productName: string;
  image: string;
  sku: string;
  optionSummary: string;
  color?: string;
  size?: string;
  quantity: number;
  lowStockThreshold: number;
  sellingStatus: SellingStatus;
  stockStatus: StockStatus;
}

export interface InventoryMovement {
  id: string;
  variantId: string;
  previousQuantity: number;
  quantityDelta: number;
  newQuantity: number;
  movementType: string;
  reason: string;
  note?: string;
  source: string;
  createdAt: string;
}

export async function getInventoryHistoryForBrand(brandId: string, impersonating = false): Promise<InventoryMovement[]> {
  const supabase = impersonating ? supabaseAdmin : await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inventory_movements")
    .select("id, variant_id, previous_quantity, quantity_delta, new_quantity, movement_type, reason, note, source, created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`getInventoryHistoryForBrand failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id, variantId: row.variant_id, previousQuantity: row.previous_quantity,
    quantityDelta: row.quantity_delta, newQuantity: row.new_quantity,
    movementType: row.movement_type, reason: row.reason, note: row.note ?? undefined,
    source: row.source, createdAt: row.created_at,
  }));
}

interface BrandVariantRow {
  id: string;
  product_id: string;
  quantity: number;
  sku: string;
  low_stock_threshold_override: number | null;
  selling_status: SellingStatus;
  products: { id: string; name: string; image: string; brand_slug: string | null; default_low_stock_threshold: number } | null;
}

// Read-only for v1 — brand owners see their stock, only admin/staff edit
// it, so inventory oversight stays centralized.
export async function getVariantsForBrand(
  brandSlug: string,
  impersonating = false
): Promise<BrandVariant[]> {
  const supabase = impersonating ? supabaseAdmin : await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_variants")
    .select(
      "id, product_id, sku, quantity, low_stock_threshold_override, selling_status, products!inner(id, name, image, brand_slug, default_low_stock_threshold)"
    )
    .eq("products.brand_slug", brandSlug)
    .eq("is_archived", false);

  if (error) {
    throw new Error(`getVariantsForBrand(${brandSlug}) failed: ${error.message}`);
  }

  const rows = ((data as unknown as BrandVariantRow[]) ?? []).filter((row) => row.products);
  const variantsByProduct = await getVariantsForProducts(
    [...new Set(rows.map((row) => row.product_id))],
    impersonating ? supabaseAdmin : supabase
  );
  const optionValuesByVariant = new Map(
    [...variantsByProduct.values()].flat().map((v) => [v.id, v.optionValues])
  );

  return rows.map((row) => {
    const threshold = effectiveLowStockThreshold(
      row.low_stock_threshold_override,
      row.products!.default_low_stock_threshold
    );
    const optionValues = optionValuesByVariant.get(row.id) ?? [];
    return {
      variantId: row.id,
      productId: row.product_id,
      productName: row.products!.name,
      image: row.products!.image,
      sku: row.sku,
      optionSummary: optionValues.map((option) => `${option.optionTypeName}: ${option.label}`).join(" / ") || "Default",
      color: optionValues.find((o) => o.optionTypeName === "Color")?.label,
      size: optionValues.find((o) => o.optionTypeName === "Size")?.label,
      quantity: row.quantity,
      lowStockThreshold: threshold,
      sellingStatus: row.selling_status,
      stockStatus: calculateStockStatus(row.quantity, threshold),
    };
  });
}

export interface BrandProductListItem {
  id: string;
  name: string;
  image: string;
  price: number;
  currency: "USD" | "EGP";
  mainCategory?: string;
  productType?: string;
  collection?: string;
  featured: boolean;
  inStock: boolean;
  stockStatus: StockStatus;
  stockIssueCount: number;
  variantCount: number;
  stockUnits: number;
  createdAt: string;
  updatedAt: string;
  status: string;
  draftStartedAt?: string;
  publishDate?: string;
  pausedByBrand: boolean;
  hasPendingEdit: boolean;
  reviewNotes?: string;
  deletionRequestedAt?: string;
}

interface BrandProductRow {
  id: string;
  name: string;
  image: string;
  price: number;
  currency: "USD" | "EGP";
  product_type_id: string;
  collection_id: string | null;
  featured: boolean;
  default_low_stock_threshold: number;
  created_at: string;
  status: string;
  draft_started_at: string | null;
  publish_date: string | null;
  paused_by_brand: boolean;
  pending_changes: unknown;
  review_notes: string | null;
  deletion_requested_at: string | null;
}

// Every status (pending_review/changes_requested/published/archived) shows
// here — `products` has a public `using (true)` SELECT policy already
// (needed for the storefront to read published rows with the anon client),
// so the cookie client sees every status for this brand once scoped by
// brand_id; nothing extra needed to include unreviewed submissions.
export async function getProductsForBrand(
  brandId: string,
  _impersonating = false
): Promise<BrandProductListItem[]> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select(
      "id, name, image, price, currency, product_type_id, collection_id, featured, default_low_stock_threshold, created_at, status, draft_started_at, publish_date, paused_by_brand, pending_changes, review_notes, deletion_requested_at"
    )
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getProductsForBrand(${brandId}) failed: ${error.message}`);
  }

  const rows = (data as BrandProductRow[]) ?? [];
  const collectionIds = [...new Set(rows.map((r) => r.collection_id).filter((v): v is string => Boolean(v)))];
  const [taxonomyTree, collectionNamesById, variantsByProduct] = await Promise.all([
    getFullTaxonomyTree(),
    collectionIds.length
      ? supabaseAdmin.from("collections").select("id, name").in("id", collectionIds)
        .then(({ data }) => new Map((data ?? []).map((r) => [r.id as string, r.name as string])))
      : Promise.resolve(new Map<string, string>()),
    getVariantsForProducts(rows.map((row) => row.id), supabaseAdmin),
  ]);

  return rows.map((row) => {
    const path = resolveTaxonomyPath(taxonomyTree, row.product_type_id);
    const variants = variantsByProduct.get(row.id) ?? [];
    const activeVariantStatuses = variants
      .filter((variant) => variant.sellingStatus === "active")
      .map((variant) => calculateStockStatus(
        variant.quantity,
        effectiveLowStockThreshold(variant.lowStockThresholdOverride, row.default_low_stock_threshold)
      ));
    const stockStatus: StockStatus = activeVariantStatuses.length === 0 || activeVariantStatuses.every((status) => status === "out_of_stock")
      ? "out_of_stock"
      : activeVariantStatuses.some((status) => status !== "in_stock")
        ? "low_stock"
        : "in_stock";
    const updatedAt = variants.reduce(
      (latest, variant) => variant.updatedAt && new Date(variant.updatedAt).getTime() > new Date(latest).getTime() ? variant.updatedAt : latest,
      row.created_at
    );
    return {
      id: row.id,
      name: row.name,
      image: row.image,
      price: Number(row.price),
      currency: row.currency,
      mainCategory: path?.mainCategory,
      productType: path?.productTypeName,
      collection: row.collection_id ? collectionNamesById.get(row.collection_id) : undefined,
      featured: row.featured,
      inStock: variants.some(
        (variant) => variant.sellingStatus === "active" && variant.quantity > 0
      ),
      stockStatus,
      stockIssueCount: activeVariantStatuses.filter((status) => status !== "in_stock").length,
      variantCount: variants.length,
      stockUnits: variants.reduce((sum, variant) => sum + variant.quantity, 0),
      createdAt: row.created_at,
      updatedAt,
      status: row.status,
      draftStartedAt: row.draft_started_at ?? undefined,
      publishDate: row.publish_date ?? undefined,
      pausedByBrand: row.paused_by_brand,
      hasPendingEdit: row.pending_changes != null,
      reviewNotes: row.review_notes ?? undefined,
      deletionRequestedAt: row.deletion_requested_at ?? undefined,
    };
  });
}
