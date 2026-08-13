import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getFullTaxonomyTree, resolveTaxonomyPath } from "@/lib/data/taxonomy";
import { getVariantsForProducts } from "@/lib/data/variants";
import { calculateStockStatus, effectiveLowStockThreshold } from "@/lib/inventory/stockStatus";
import { estimateDaysRemaining, suggestedRestockQuantity } from "@/lib/inventory/brandInventoryInsights";
import type { OrderItemDiscountSource, SellingStatus, StockStatus } from "@/types";
import { buildColorImageLookup, resolveVariantImage } from "@/lib/orders/variantImage";

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
  productId: string;
  variantId: string | null;
  name: string;
  size: string;
  color?: string;
  price: number;
  currency: "USD" | "EGP";
  quantity: number;
  image?: string;
  // Pricing snapshot — see supabase/migrations/
  // 20260813000002_order_pricing_snapshots.sql. All null on historical
  // rows placed before that migration; never derived from a product's
  // current price. originalUnitPrice/discountSource together decide
  // whether the UI shows a strikethrough (only when discountSource is not
  // "none"/null AND originalUnitPrice is present).
  originalUnitPrice: number | null;
  discountPercentSnapshot: number | null;
  discountSource: OrderItemDiscountSource | null;
  // This line's own share of the order's coupon discount — always this
  // brand's own line, never another brand's, since every row here is
  // already scoped by the brand_slug filter below.
  itemCouponDiscountEgp: number;
}

export interface BrandOrder {
  id: string;
  orderNumber: string;
  status: string;
  shippingName: string;
  shippingCity: string;
  shippingGovernorate: string;
  createdAt: string;
  history: Array<{ status: string; note?: string; createdAt: string }>;
  isOverdue: boolean;
  items: BrandOrderItem[];
  // 'brand_direct' orders are this brand's own shipment (this brand can
  // advance its status); 'mahaly_pool' orders pool this brand's items with
  // other partner brands' — Zakhnook's own warehouse fulfills those, so the
  // brand-portal view stays read-only for them (see BrandOrdersTable).
  fulfillmentType: "mahaly_pool" | "brand_direct";
  shippingFeeEgp: number;
  paymentMethod: string;
  paymentStatus: string;
  // A 'mahaly_pool' order can contain other brands' items too — this
  // brand's own products subtotal/discount below are always summed from
  // ONLY this order's own `items` array (already brand_slug-scoped), never
  // from orders.subtotal_egp/discount_amount_egp directly, which would be
  // the WHOLE pooled shipment's totals across every brand in it. Computed
  // here, once, so every caller gets the same brand-scoped numbers instead
  // of recomputing (and risking reaching for the wrong, order-wide field).
  brandProductsSubtotalEgp: number;
  brandDiscountEgp: number;
  couponCode: string | null;
  // This brand's pool/shipment is one piece of a larger purchase — masterOrderNumber
  // is shown so the UI can label "part of purchase ZK-XXXXXX" without ever
  // fetching (or needing) any other brand's order/items.
  masterOrderNumber: string | null;
}

interface OrderItemRow {
  id: string;
  product_id: string;
  variant_id: string | null;
  image: string | null;
  name: string;
  size: string;
  color: string | null;
  price: number;
  currency: "USD" | "EGP";
  quantity: number;
  original_unit_price: number | null;
  discount_percent_snapshot: number | null;
  discount_source: OrderItemDiscountSource | null;
  item_coupon_discount_egp: number;
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
    payment_method: string;
    payment_status: string;
    coupon_code: string | null;
    master_orders: { master_order_number: string } | null;
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
      "id, product_id, variant_id, image, name, size, color, price, currency, quantity, original_unit_price, discount_percent_snapshot, discount_source, item_coupon_discount_egp, order_id, orders(id, order_number, status, shipping_name, shipping_city, shipping_governorate, created_at, fulfillment_type, shipping_fee_egp, payment_method, payment_status, coupon_code, master_orders(master_order_number))"
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
      history: [],
      isOverdue: false,
      fulfillmentType: row.orders.fulfillment_type,
      shippingFeeEgp: Number(row.orders.shipping_fee_egp),
      paymentMethod: row.orders.payment_method,
      paymentStatus: row.orders.payment_status,
      brandProductsSubtotalEgp: 0,
      brandDiscountEgp: 0,
      couponCode: row.orders.coupon_code,
      masterOrderNumber: row.orders.master_orders?.master_order_number ?? null,
      items: [],
    };
    existing.items.push({
      id: row.id,
      productId: row.product_id,
      variantId: row.variant_id,
      name: row.name,
      size: row.size,
      color: row.color ?? undefined,
      price: Number(row.price),
      currency: row.currency,
      quantity: row.quantity,
      image: row.image?.trim() || undefined,
      originalUnitPrice: row.original_unit_price != null ? Number(row.original_unit_price) : null,
      discountPercentSnapshot:
        row.discount_percent_snapshot != null ? Number(row.discount_percent_snapshot) : null,
      discountSource: row.discount_source,
      itemCouponDiscountEgp: Number(row.item_coupon_discount_egp ?? 0),
    });
    if (row.currency === "EGP") {
      existing.brandProductsSubtotalEgp += Number(row.price) * row.quantity;
      existing.brandDiscountEgp += Number(row.item_coupon_discount_egp ?? 0);
    }
    byOrder.set(row.orders.id, existing);
  }

  const orders = [...byOrder.values()];
  if (orders.length) {
    const { data: historyRows, error: historyError } = await supabaseAdmin
      .from("order_status_history")
      .select("order_id, status, note, created_at")
      .in("order_id", orders.map((order) => order.id))
      .order("created_at", { ascending: true });
    if (historyError) throw new Error(`getOrdersForBrand(${brandSlug}) history failed: ${historyError.message}`);
    for (const row of historyRows ?? []) {
      const order = byOrder.get(row.order_id);
      if (!order) continue;
      order.history.push({ status: row.status, note: row.note ?? undefined, createdAt: row.created_at });
    }
    const now = Date.now();
    for (const order of orders) {
      if (order.fulfillmentType !== "brand_direct" || !["paid", "preparing"].includes(order.status)) continue;
      const currentStatusStartedAt = [...order.history].reverse().find((entry) => entry.status === order.status)?.createdAt ?? order.createdAt;
      order.isOverdue = now - new Date(currentStatusStartedAt).getTime() > 24 * 60 * 60 * 1000;
    }
  }
  const orderItems = orders.flatMap((order) => order.items);
  if (orderItems.length) {
    const productIds = [...new Set(orderItems.map((item) => item.productId))];
    const [variantsByProduct, mediaResult, productsResult] = await Promise.all([
      getVariantsForProducts(productIds, supabaseAdmin),
      supabaseAdmin
        .from("product_media")
        .select("product_id, storage_reference, color_option_value_id")
        .in("product_id", productIds)
        .eq("is_archived", false)
        .not("color_option_value_id", "is", null)
        .order("display_order", { ascending: true }),
      supabaseAdmin.from("products").select("id, image").in("id", productIds),
    ]);
    if (mediaResult.error) throw new Error(`getOrdersForBrand(${brandSlug}) media failed: ${mediaResult.error.message}`);
    if (productsResult.error) throw new Error(`getOrdersForBrand(${brandSlug}) products failed: ${productsResult.error.message}`);

    const mediaByColor = buildColorImageLookup(mediaResult.data ?? []);
    const productCovers = new Map((productsResult.data ?? []).map((product) => [product.id, product.image as string]));
    const variantsById = new Map([...variantsByProduct.values()].flat().map((variant) => [variant.id, variant] as const));
    for (const item of orderItems) {
      const variant = item.variantId ? variantsById.get(item.variantId) : undefined;
      item.image = resolveVariantImage(
        item.productId,
        variant,
        mediaByColor,
        item.image ?? productCovers.get(item.productId)
      ) || undefined;
    }
  }

  return orders
    .map((order) => ({
      ...order,
      brandProductsSubtotalEgp: Math.round(order.brandProductsSubtotalEgp * 100) / 100,
      brandDiscountEgp: Math.round(order.brandDiscountEgp * 100) / 100,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
  soldLast30Days: number;
  estimatedDaysRemaining?: number;
  suggestedRestock: number;
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
  const productIds = [...new Set(rows.map((row) => row.product_id))];
  const dataClient = impersonating ? supabaseAdmin : supabase;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [variantsByProduct, mediaResult, salesResult] = await Promise.all([
    getVariantsForProducts(productIds, dataClient),
    productIds.length
      ? dataClient
        .from("product_media")
        .select("product_id, storage_reference, color_option_value_id")
        .in("product_id", productIds)
        .eq("is_archived", false)
        .not("color_option_value_id", "is", null)
        .order("display_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from("order_items")
      .select("variant_id, quantity, orders!inner(status, created_at)")
      .eq("brand_slug", brandSlug)
      .gte("orders.created_at", since)
      .neq("orders.status", "cancelled"),
  ]);
  if (mediaResult.error) throw new Error(`getVariantsForBrand(${brandSlug}) media failed: ${mediaResult.error.message}`);
  if (salesResult.error) throw new Error(`getVariantsForBrand(${brandSlug}) sales failed: ${salesResult.error.message}`);

  const optionValuesByVariant = new Map(
    [...variantsByProduct.values()].flat().map((v) => [v.id, v.optionValues])
  );
  const mediaByColor = new Map<string, string>();
  for (const media of mediaResult.data ?? []) {
    if (!media.color_option_value_id) continue;
    const key = `${media.product_id}:${media.color_option_value_id}`;
    if (!mediaByColor.has(key)) mediaByColor.set(key, media.storage_reference);
  }
  const soldByVariant = new Map<string, number>();
  for (const sale of salesResult.data ?? []) {
    if (!sale.variant_id) continue;
    soldByVariant.set(sale.variant_id, (soldByVariant.get(sale.variant_id) ?? 0) + Number(sale.quantity));
  }

  return rows.map((row) => {
    const threshold = effectiveLowStockThreshold(
      row.low_stock_threshold_override,
      row.products!.default_low_stock_threshold
    );
    const optionValues = optionValuesByVariant.get(row.id) ?? [];
    const colorValue = optionValues.find((option) => option.optionTypeName === "Color");
    const soldLast30Days = soldByVariant.get(row.id) ?? 0;
    const daysRemaining = estimateDaysRemaining(row.quantity, soldLast30Days);
    return {
      variantId: row.id,
      productId: row.product_id,
      productName: row.products!.name,
      image: (colorValue ? mediaByColor.get(`${row.product_id}:${colorValue.optionValueId}`) : undefined) ?? row.products!.image,
      sku: row.sku,
      optionSummary: optionValues.map((option) => `${option.optionTypeName}: ${option.label}`).join(" / ") || "Default",
      color: optionValues.find((o) => o.optionTypeName === "Color")?.label,
      size: optionValues.find((o) => o.optionTypeName === "Size")?.label,
      quantity: row.quantity,
      lowStockThreshold: threshold,
      sellingStatus: row.selling_status,
      stockStatus: calculateStockStatus(row.quantity, threshold),
      soldLast30Days,
      estimatedDaysRemaining: daysRemaining ?? undefined,
      suggestedRestock: suggestedRestockQuantity(row.quantity, threshold, soldLast30Days),
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
