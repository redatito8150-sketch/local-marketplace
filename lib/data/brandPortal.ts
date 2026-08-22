import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getFullTaxonomyTree, resolveTaxonomyPath } from "@/lib/data/taxonomy";
import { getVariantsForProducts } from "@/lib/data/variants";
import { calculateStockStatus, effectiveLowStockThreshold } from "@/lib/inventory/stockStatus";
import { estimateDaysRemaining, suggestedRestockQuantity } from "@/lib/inventory/brandInventoryInsights";
import type { OptionSwatchType, OrderItemDiscountSource, ProductStatus, ProductVariant, SellingStatus, StockStatus } from "@/types";
import { buildColorImageLookup, resolveVariantImage } from "@/lib/orders/variantImage";
import { getOrderRefundSummaries } from "@/lib/data/refunds";

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
  capturedAmountCents: number;
  refundedAmountCents: number;
  refundPendingAmountCents: number;
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
  discount_percent: number | null;
  discount_ends_at: string | null;
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
      capturedAmountCents: 0,
      refundedAmountCents: 0,
      refundPendingAmountCents: 0,
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
      if (order.fulfillmentType !== "brand_direct" || !["confirmed", "pending", "paid", "preparing"].includes(order.status)) continue;
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

  const refundSummaries = await getOrderRefundSummaries(orders.map((order) => order.id));
  for (const order of orders) {
    const summary = refundSummaries.get(order.id);
    if (!summary) continue;
    order.capturedAmountCents = summary.capturedAmountCents;
    order.refundedAmountCents = summary.refundedAmountCents;
    order.refundPendingAmountCents = summary.pendingAmountCents;
    order.paymentStatus = summary.paymentStatus;
  }

  return orders
    .map((order) => ({
      ...order,
      brandProductsSubtotalEgp: Math.round(order.brandProductsSubtotalEgp * 100) / 100,
      brandDiscountEgp: Math.round(order.brandDiscountEgp * 100) / 100,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export interface BrandVariantLatestRequest {
  transferId: string;
  documentNumber: string | null;
  status: string;
  requestedAt: string;
  requestedQty: number;
  isOpen: boolean;
}

export interface BrandVariant {
  variantId: string;
  productId: string;
  productName: string;
  image: string;
  // The product's own designated cover photo (products.image), never a
  // color-specific fallback — distinct from `image` above, which resolves
  // to this specific variant's own color photo when one exists. Used for
  // the collapsed, product-level row in the grouped Inventory table
  // (components/brand-portal/InventoryManager.tsx); `image` stays what
  // the expanded per-color/size rows use. Only populated by
  // getInventoryPageForBrand — getVariantsForBrand (the Overview
  // snapshot, which never renders a collapsed product row) leaves it
  // equal to `image`.
  productImage: string;
  sku: string;
  optionSummary: string;
  color?: string;
  size?: string;
  swatchType?: OptionSwatchType;
  primaryColor?: string;
  secondaryColor?: string;
  sizeSortOrder?: number;
  sizeBrandId?: string | null;
  quantity: number;
  incomingQuantity: number;
  lowStockThreshold: number;
  sellingStatus: SellingStatus;
  stockStatus: StockStatus;
  soldLast30Days: number;
  estimatedDaysRemaining?: number;
  suggestedRestock: number;
  // The single most relevant (open, else most recent) replenishment
  // document referencing this variant — only populated by
  // getInventoryPageForBrand (the paginated read model); getVariantsForBrand
  // (used by the Overview snapshot) never sets this, since that view has no
  // per-row request-status UI to show it in.
  latestRequest?: BrandVariantLatestRequest;
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
  actor: {
    id: string;
    displayName: string;
    roleLabel: string;
  } | null;
  reference: {
    id: string;
    type: "warehouse_document" | "warehouse_receipt" | "warehouse_correction" | "order";
    label: string;
    href: string;
  } | null;
  createdAt: string;
}

const INVENTORY_MOVEMENT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function orderIdFromBrandMovement(source: string, sourceOperationKey: string): string | null {
  if (source !== "order" && source !== "order_cancellation") return null;
  const candidate = sourceOperationKey.split(":")[1];
  return candidate && INVENTORY_MOVEMENT_UUID_PATTERN.test(candidate) ? candidate : null;
}

function brandMovementActorRoleLabel(profileRole: string | null, isStaff: boolean, accessLevel?: string | null): string {
  if (isStaff) return "Zakhnook staff";
  if (accessLevel === "owner" || profileRole === "brand_owner") return "Brand owner";
  if (accessLevel === "assistant" || profileRole === "brand_assistant") return "Brand assistant";
  return "Brand member";
}

export async function getInventoryHistoryForBrand(brandId: string, impersonating = false): Promise<InventoryMovement[]> {
  const supabase = impersonating ? supabaseAdmin : await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inventory_movements")
    .select("id, variant_id, previous_quantity, quantity_delta, new_quantity, movement_type, reason, note, created_by, source, source_operation_key, related_entity_type, related_entity_id, created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`getInventoryHistoryForBrand failed: ${error.message}`);

  const movementRows = data ?? [];
  const actorIds = [...new Set(movementRows.map((row) => row.created_by).filter((id): id is string => typeof id === "string"))];
  const warehouseDocumentIds = [...new Set(movementRows.filter((row) => row.related_entity_type === "warehouse_document" && row.related_entity_id).map((row) => row.related_entity_id as string))];
  const warehouseReceiptIds = [...new Set(movementRows.filter((row) => row.related_entity_type === "warehouse_receipt" && row.related_entity_id).map((row) => row.related_entity_id as string))];
  const warehouseCorrectionIds = [...new Set(movementRows.filter((row) => row.related_entity_type === "warehouse_correction" && row.related_entity_id).map((row) => row.related_entity_id as string))];
  const orderIds = [...new Set(movementRows.flatMap((row) => {
    if (row.related_entity_type === "order" && row.related_entity_id) return [row.related_entity_id as string];
    const parsed = orderIdFromBrandMovement(row.source as string, row.source_operation_key as string);
    return parsed ? [parsed] : [];
  }))];

  const { data: movementBrand, error: movementBrandError } = orderIds.length
    ? await supabaseAdmin.from("brands").select("slug").eq("id", brandId).maybeSingle()
    : { data: null, error: null };
  if (movementBrandError) throw new Error(`getInventoryHistoryForBrand brand scope failed: ${movementBrandError.message}`);

  const [profilesResult, membershipsResult, documentsResult, receiptsResult, correctionsResult, ordersResult] = await Promise.all([
    actorIds.length
      ? supabaseAdmin.from("profiles").select("id, full_name, email, is_admin, role").in("id", actorIds)
      : Promise.resolve({ data: [], error: null }),
    actorIds.length
      ? supabaseAdmin.from("brand_staff").select("user_id, access_level").eq("brand_id", brandId).in("user_id", actorIds)
      : Promise.resolve({ data: [], error: null }),
    warehouseDocumentIds.length
      ? supabaseAdmin.from("warehouse_transfers").select("id, document_number").in("id", warehouseDocumentIds).eq("brand_id", brandId)
      : Promise.resolve({ data: [], error: null }),
    warehouseReceiptIds.length
      ? supabaseAdmin.from("warehouse_receipts").select("id, receipt_number, transfer_id, warehouse_transfers!inner(brand_id)").in("id", warehouseReceiptIds).eq("warehouse_transfers.brand_id", brandId)
      : Promise.resolve({ data: [], error: null }),
    warehouseCorrectionIds.length
      ? supabaseAdmin.from("warehouse_corrections").select("id, correction_number, transfer_id, warehouse_transfers!inner(brand_id)").in("id", warehouseCorrectionIds).eq("warehouse_transfers.brand_id", brandId)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabaseAdmin.from("orders").select("id, order_number, order_items!inner(brand_slug)").in("id", orderIds).eq("order_items.brand_slug", movementBrand?.slug ?? "")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profilesResult.error) throw new Error(`getInventoryHistoryForBrand actors failed: ${profilesResult.error.message}`);
  if (membershipsResult.error) throw new Error(`getInventoryHistoryForBrand memberships failed: ${membershipsResult.error.message}`);
  if (documentsResult.error) throw new Error(`getInventoryHistoryForBrand warehouse documents failed: ${documentsResult.error.message}`);
  if (receiptsResult.error) throw new Error(`getInventoryHistoryForBrand receipts failed: ${receiptsResult.error.message}`);
  if (correctionsResult.error) throw new Error(`getInventoryHistoryForBrand corrections failed: ${correctionsResult.error.message}`);
  if (ordersResult.error) throw new Error(`getInventoryHistoryForBrand orders failed: ${ordersResult.error.message}`);

  const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.id as string, profile]));
  const accessByActorId = new Map((membershipsResult.data ?? []).map((membership) => [membership.user_id as string, membership.access_level as string]));
  const references = new Map<string, InventoryMovement["reference"]>();

  for (const document of documentsResult.data ?? []) {
    references.set(`warehouse_document:${document.id}`, {
      id: document.id as string,
      type: "warehouse_document",
      label: (document.document_number as string | null) ?? `Warehouse document ${String(document.id).slice(0, 8)}`,
      href: `/brand-portal/warehouse/${document.id}`,
    });
  }
  for (const receipt of receiptsResult.data ?? []) {
    references.set(`warehouse_receipt:${receipt.id}`, {
      id: receipt.id as string,
      type: "warehouse_receipt",
      label: receipt.receipt_number as string,
      href: `/brand-portal/warehouse/${receipt.transfer_id}`,
    });
  }
  for (const correction of correctionsResult.data ?? []) {
    references.set(`warehouse_correction:${correction.id}`, {
      id: correction.id as string,
      type: "warehouse_correction",
      label: correction.correction_number as string,
      href: `/brand-portal/warehouse/${correction.transfer_id}`,
    });
  }
  for (const order of ordersResult.data ?? []) {
    references.set(`order:${order.id}`, {
      id: order.id as string,
      type: "order",
      label: order.order_number as string,
      href: `/brand-portal/orders?order=${encodeURIComponent(order.id as string)}`,
    });
  }

  return movementRows.map((row) => {
    const actorProfile = typeof row.created_by === "string" ? profiles.get(row.created_by) : null;
    const isStaff = Boolean(actorProfile?.is_admin);
    const actor = actorProfile ? {
      id: actorProfile.id as string,
      displayName: isStaff
        ? "Zakhnook Staff Team"
        : (actorProfile.full_name as string | null)?.trim() || (actorProfile.email as string | null)?.split("@")[0] || "Team member",
      roleLabel: brandMovementActorRoleLabel(actorProfile.role as string | null, isStaff, accessByActorId.get(actorProfile.id as string)),
    } : null;
    const parsedOrderId = orderIdFromBrandMovement(row.source as string, row.source_operation_key as string);
    const relatedEntityType = (row.related_entity_type as string | null) ?? (parsedOrderId ? "order" : null);
    const relatedEntityId = (row.related_entity_id as string | null) ?? parsedOrderId;
    const reference = relatedEntityType && relatedEntityId
      ? references.get(`${relatedEntityType}:${relatedEntityId}`) ?? null
      : null;

    return {
      id: row.id,
      variantId: row.variant_id,
      previousQuantity: row.previous_quantity,
      quantityDelta: row.quantity_delta,
      newQuantity: row.new_quantity,
      movementType: row.movement_type,
      reason: row.reason,
      note: row.note ?? undefined,
      source: row.source,
      actor,
      reference,
      createdAt: row.created_at,
    };
  });
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
  const [variantsByProduct, mediaResult, salesResult, incomingResult] = await Promise.all([
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
    rows.length
      ? supabaseAdmin
        .from("warehouse_transfer_items")
        .select("variant_id, requested_qty, received_ok_qty, warehouse_transfers!inner(status, direction)")
        .in("variant_id", rows.map((row) => row.id))
        .eq("warehouse_transfers.direction", "to_local")
        .in("warehouse_transfers.status", ["pending", "submitted", "approved", "in_transit", "receiving", "partially_received"])
        .is("received_ok_qty", null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (mediaResult.error) throw new Error(`getVariantsForBrand(${brandSlug}) media failed: ${mediaResult.error.message}`);
  if (salesResult.error) throw new Error(`getVariantsForBrand(${brandSlug}) sales failed: ${salesResult.error.message}`);
  if (incomingResult.error) throw new Error(`getVariantsForBrand(${brandSlug}) incoming stock failed: ${incomingResult.error.message}`);

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
  const incomingByVariant = new Map<string, number>();
  for (const item of incomingResult.data ?? []) {
    if (!item.variant_id) continue;
    incomingByVariant.set(item.variant_id, (incomingByVariant.get(item.variant_id) ?? 0) + Number(item.requested_qty));
  }

  return rows.map((row) => {
    const threshold = effectiveLowStockThreshold(
      row.low_stock_threshold_override,
      row.products!.default_low_stock_threshold
    );
    const optionValues = optionValuesByVariant.get(row.id) ?? [];
    const colorValue = optionValues.find((option) => option.optionTypeName === "Color");
    const sizeValue = optionValues.find((option) => option.optionTypeName === "Size");
    const soldLast30Days = soldByVariant.get(row.id) ?? 0;
    const daysRemaining = estimateDaysRemaining(row.quantity, soldLast30Days);
    return {
      variantId: row.id,
      productId: row.product_id,
      productName: row.products!.name,
      image: (colorValue ? mediaByColor.get(`${row.product_id}:${colorValue.optionValueId}`) : undefined) ?? row.products!.image,
      productImage: row.products!.image,
      sku: row.sku,
      optionSummary: optionValues.map((option) => `${option.optionTypeName}: ${option.label}`).join(" / ") || "Default",
      color: colorValue?.label,
      size: sizeValue?.label,
      swatchType: colorValue?.swatchType,
      primaryColor: colorValue?.primaryColor,
      secondaryColor: colorValue?.secondaryColor,
      sizeSortOrder: sizeValue?.sortOrder,
      sizeBrandId: sizeValue?.brandId,
      quantity: row.quantity,
      incomingQuantity: incomingByVariant.get(row.id) ?? 0,
      lowStockThreshold: threshold,
      sellingStatus: row.selling_status,
      stockStatus: calculateStockStatus(row.quantity, threshold),
      soldLast30Days,
      estimatedDaysRemaining: daysRemaining ?? undefined,
      suggestedRestock: suggestedRestockQuantity(row.quantity, threshold, soldLast30Days),
    };
  });
}

export interface InventoryPageSummary {
  totalVariantCount: number;
  totalAvailableUnits: number;
  healthyCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  matchingResultCount: number;
}

export interface InventoryPageOptions {
  search?: string;
  stockStatus?: "all" | "in_stock" | "low_stock" | "out_of_stock";
  sort?: "risk" | "sales" | "name" | "stock_asc" | "stock_desc";
  cursor?: string | null;
  pageSize?: number;
  productId?: string;
}

export interface InventoryPageResult {
  variants: BrandVariant[];
  summary: InventoryPageSummary;
  nextCursor: string | null;
  hasMore: boolean;
}

interface InventoryPageRpcItem {
  variantId: string;
  productId: string;
  productName: string;
  image: string | null;
  productImage: string | null;
  color: string | null;
  size: string | null;
  sku: string;
  availableAtZakhnook: number;
  incomingQuantity: number;
  lowStockThreshold: number;
  stockStatus: StockStatus;
  soldLast30Days: number;
  estimatedDaysRemaining: number | null;
  suggestedRestock: number;
  sellingStatus: SellingStatus;
  latestRequest: BrandVariantLatestRequest | null;
}

function decodeInventoryCursor(cursor: string | null | undefined): { productId: string; sortValue: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (
      typeof parsed === "object" && parsed !== null &&
      typeof (parsed as { productId?: unknown }).productId === "string" &&
      typeof (parsed as { sortValue?: unknown }).sortValue === "string"
    ) {
      return parsed as { productId: string; sortValue: string };
    }
  } catch {
    // Falls through to null below — an invalid/tampered cursor silently
    // restarts from the first page, the same forgiving behavior the old
    // OFFSET-based `?page=` param already had when clamped out of range.
  }
  return null;
}

// The paginated, product-group-cursor-safe read model behind the grouped
// Inventory page (app/brand-portal/stock/page.tsx +
// components/brand-portal/InventoryManager.tsx). Unlike getVariantsForBrand
// above (which still loads a brand's ENTIRE active catalog — kept for the
// Overview snapshot, which only needs coarse totals, not a rendered,
// paginated table), every filter/sort/pagination decision here happens
// inside supabase/migrations/20260814010500_partner_replenishment_request.sql's
// brand_portal_inventory_page RPC. Only callable via supabaseAdmin — the
// RPC is service_role-only (see its grants), never reachable by the
// anon/authenticated cookie client even under RLS, so this function always
// uses supabaseAdmin regardless of impersonation (the brandId itself is
// already a trusted value from requireBrandOwner()'s own verified context,
// exactly like every other supabaseAdmin.rpc() call in this codebase).
export async function getInventoryPageForBrand(
  brandId: string,
  options: InventoryPageOptions = {}
): Promise<InventoryPageResult> {
  const { data, error } = await supabaseAdmin.rpc("brand_portal_inventory_page", {
    p_brand_id: brandId,
    p_search: options.search?.trim() || null,
    p_stock_status: options.stockStatus ?? "all",
    p_sort: options.sort ?? "risk",
    p_cursor: decodeInventoryCursor(options.cursor),
    p_page_size: options.pageSize ?? 10,
    p_product_id: options.productId ?? null,
  } as never);
  if (error) throw new Error(`getInventoryPageForBrand(${brandId}) failed: ${error.message}`);

  const result = data as unknown as {
    items: InventoryPageRpcItem[];
    nextCursor: { productId: string; sortValue: string } | null;
    hasMore: boolean;
    summary: InventoryPageSummary;
  };

  // The canonical inventory RPC deliberately stays focused on stock and
  // pagination. Enrich the bounded page with the existing option metadata so
  // the Brand Portal renders the exact same color swatches and authoritative
  // size order as Admin Inventory without duplicating either rule in SQL.
  const variantsByProduct = await getVariantsForProducts(
    [...new Set(result.items.map((item) => item.productId))],
    supabaseAdmin,
  );
  const optionValuesByVariant = new Map(
    [...variantsByProduct.values()].flat().map((variant) => [variant.id, variant.optionValues]),
  );

  return {
    variants: result.items.map((item) => {
      const optionValues = optionValuesByVariant.get(item.variantId) ?? [];
      const colorValue = optionValues.find((option) => option.optionTypeName === "Color");
      const sizeValue = optionValues.find((option) => option.optionTypeName === "Size");
      return {
      variantId: item.variantId,
      productId: item.productId,
      productName: item.productName,
      image: item.image ?? "",
      productImage: item.productImage ?? item.image ?? "",
      sku: item.sku,
      optionSummary: [
        item.color ? `Color: ${item.color}` : null,
        item.size ? `Size: ${item.size}` : null,
      ].filter(Boolean).join(" / ") || "Default",
      color: item.color ?? undefined,
      size: item.size ?? undefined,
      swatchType: colorValue?.swatchType,
      primaryColor: colorValue?.primaryColor,
      secondaryColor: colorValue?.secondaryColor,
      sizeSortOrder: sizeValue?.sortOrder,
      sizeBrandId: sizeValue?.brandId,
      quantity: item.availableAtZakhnook,
      incomingQuantity: item.incomingQuantity,
      lowStockThreshold: item.lowStockThreshold,
      sellingStatus: item.sellingStatus,
      stockStatus: item.stockStatus,
      soldLast30Days: item.soldLast30Days,
      estimatedDaysRemaining: item.estimatedDaysRemaining ?? undefined,
      suggestedRestock: item.suggestedRestock,
      latestRequest: item.latestRequest ?? undefined,
      };
    }),
    summary: result.summary,
    nextCursor: result.nextCursor
      ? Buffer.from(JSON.stringify(result.nextCursor), "utf8").toString("base64url")
      : null,
    hasMore: result.hasMore,
  };
}

export interface BrandProductListItem {
  id: string;
  name: string;
  sku: string;
  variantSkus: string[];
  image: string;
  price: number;
  currency: "USD" | "EGP";
  discountPercent?: number;
  discountEndsAt?: string;
  variants: ProductVariant[];
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
  status: ProductStatus;
  draftStartedAt?: string;
  publishDate?: string;
  hasPendingEdit: boolean;
  reviewNotes?: string;
  deletionRequestedAt?: string;
  launchPolicy: "show_now" | "when_stocked";
  firstStockedAt?: string;
  firstVisibleAt?: string;
}

interface BrandProductRow {
  id: string;
  name: string;
  sku: string;
  image: string;
  price: number;
  currency: "USD" | "EGP";
  discount_percent: number | null;
  discount_ends_at: string | null;
  product_type_id: string;
  collection_id: string | null;
  featured: boolean;
  default_low_stock_threshold: number;
  created_at: string;
  status: ProductStatus;
  draft_started_at: string | null;
  publish_date: string | null;
  pending_changes: unknown;
  review_notes: string | null;
  deletion_requested_at: string | null;
  launch_policy: "show_now" | "when_stocked" | null;
  first_stocked_at: string | null;
  first_visible_at: string | null;
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
      "id, name, sku, image, price, currency, discount_percent, discount_ends_at, product_type_id, collection_id, featured, default_low_stock_threshold, created_at, status, draft_started_at, publish_date, pending_changes, review_notes, deletion_requested_at, launch_policy, first_stocked_at, first_visible_at"
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
      sku: row.sku,
      variantSkus: variants.map((variant) => variant.sku),
      image: row.image,
      price: Number(row.price),
      currency: row.currency,
      discountPercent: row.discount_percent ?? undefined,
      discountEndsAt: row.discount_ends_at ?? undefined,
      variants,
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
      hasPendingEdit: row.pending_changes != null,
      reviewNotes: row.review_notes ?? undefined,
      deletionRequestedAt: row.deletion_requested_at ?? undefined,
      launchPolicy: row.launch_policy ?? "show_now",
      firstStockedAt: row.first_stocked_at ?? undefined,
      firstVisibleAt: row.first_visible_at ?? undefined,
    };
  });
}
