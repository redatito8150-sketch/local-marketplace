import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVariantsForProducts } from "@/lib/data/variants";
import { attachVariantDerivedFields } from "@/lib/data/products";
import { toBrandApplicationRecord } from "@/lib/join/applicationService";
import { resolveTaxonomyPath } from "@/lib/data/taxonomy";
import { calculateVariantReadiness } from "@/lib/inventory/readiness";
import { calculateStockStatus, effectiveLowStockThreshold } from "@/lib/inventory/stockStatus";
import { buildColorImageLookup, resolveVariantImage } from "@/lib/orders/variantImage";
import {
  Audience,
  AuditLogRecord,
  BrandApplicationRecord,
  BrandRecord,
  CouponRecord,
  LowStockVariantRecord,
  NotificationRecord,
  OrderItemDiscountSource,
  OrderItemRecord,
  OrderRecord,
  OrderStatus,
  ProductColorOption,
  ProductRecord,
  ProductStatus,
  ProfileRecord,
  ProfileRole,
  SellingStatus,
  TaxonomyLevel,
  TaxonomyNode,
} from "@/types";

interface ProductRow {
  id: string;
  name: string;
  brand_name: string;
  brand_slug: string | null;
  brand_id: string;
  product_type_id: string;
  audience: Audience;
  collection_id: string | null;
  material: string | null;
  materials: { material: string; percentage: number }[] | null;
  fit: string | null;
  price: number;
  discount_percent: number | null;
  discount_ends_at: string | null;
  currency: "USD" | "EGP";
  image: string;
  images: string[];
  description: string;
  details: string[];
  care_instructions: string[];
  shipping_returns: string;
  model_height: string | null;
  model_wearing: string | null;
  sku: string;
  is_new: boolean;
  default_low_stock_threshold: number;
  featured: boolean;
  status: ProductStatus;
  publish_date: string | null;
  draft_started_at: string | null;
  pending_changes: Record<string, unknown> | null;
  review_notes: string | null;
  submitted_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  deletion_requested_at: string | null;
  paused_by_brand: boolean;
  launch_policy: "show_now" | "when_stocked" | null;
  first_stocked_at: string | null;
  first_visible_at: string | null;
}

// Per-batch lookup context for the display-only fields resolved from
// product_type_id/collection_id — loaded once per admin list/detail read
// rather than per row.
interface AdminProductDisplayContext {
  taxonomyTree: TaxonomyNode[];
  collectionNamesById: Map<string, string>;
}

async function loadAdminProductDisplayContext(rows: ProductRow[]): Promise<AdminProductDisplayContext> {
  const collectionIds = [...new Set(rows.map((r) => r.collection_id).filter((v): v is string => Boolean(v)))];
  const [taxonomyTree, collectionNamesById] = await Promise.all([
    getFullTaxonomyTreeForAdmin(),
    loadCollectionNamesForAdmin(collectionIds),
  ]);
  return { taxonomyTree, collectionNamesById };
}

async function loadCollectionNamesForAdmin(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabaseAdmin.from("collections").select("id, name").in("id", ids);
  if (error) throw new Error(`loadCollectionNamesForAdmin failed: ${error.message}`);
  return new Map((data ?? []).map((row) => [row.id as string, row.name as string]));
}

function toProductRecord(row: ProductRow, ctx: AdminProductDisplayContext): ProductRecord {
  const path = resolveTaxonomyPath(ctx.taxonomyTree, row.product_type_id);
  return {
    id: row.id,
    name: row.name,
    brandName: row.brand_name,
    brandSlug: row.brand_slug ?? "",
    brandId: row.brand_id,
    productTypeId: row.product_type_id,
    mainCategory: path?.mainCategory ?? "",
    productGroup: path?.productGroup ?? "",
    productTypeName: path?.productTypeName ?? "",
    audience: row.audience,
    collectionId: row.collection_id ?? undefined,
    collectionName: row.collection_id ? ctx.collectionNamesById.get(row.collection_id) : undefined,
    material: row.material ?? undefined,
    materials: row.materials ?? [],
    fit: row.fit ?? undefined,
    price: Number(row.price),
    discountPercent: row.discount_percent ?? undefined,
    discountEndsAt: row.discount_ends_at ?? undefined,
    currency: row.currency,
    image: row.image,
    images: row.images ?? [],
    // Filled in by attachVariantDerivedFields once variants are attached
    // (see getAllProductsForAdmin/getProductForAdmin below).
    colors: [],
    sizes: [],
    unavailableSizes: [],
    description: row.description,
    details: row.details ?? [],
    careInstructions: row.care_instructions ?? [],
    shippingReturns: row.shipping_returns,
    modelHeight: row.model_height ?? undefined,
    modelWearing: row.model_wearing ?? undefined,
    sku: row.sku,
    inStock: false,
    isNew: row.is_new,
    defaultLowStockThreshold: row.default_low_stock_threshold,
    featured: row.featured,
    status: row.status,
    publishDate: row.publish_date ?? undefined,
    draftStartedAt: row.draft_started_at ?? undefined,
    pendingChanges: row.pending_changes,
    reviewNotes: row.review_notes ?? undefined,
    submittedBy: row.submitted_by ?? undefined,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    deletionRequestedAt: row.deletion_requested_at ?? undefined,
    pausedByBrand: row.paused_by_brand,
    launchPolicy: row.launch_policy ?? "show_now",
    firstStockedAt: row.first_stocked_at ?? undefined,
    firstVisibleAt: row.first_visible_at ?? undefined,
  };
}

// Public SELECT policy on `products` already allows this — no service role
// needed for reads, only for the create/update/delete routes.
export async function getAllProductsForAdmin(): Promise<ProductRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAllProductsForAdmin failed: ${error.message}`);
  }
  const rows = data as ProductRow[];
  const ctx = await loadAdminProductDisplayContext(rows);
  const variantsByProduct = await getVariantsForProducts(rows.map((r) => r.id), supabaseAdmin);
  return rows.map((row) => {
    const variants = variantsByProduct.get(row.id) ?? [];
    const record = attachVariantDerivedFields(toProductRecord(row, ctx), variants);
    record.variantReadiness = calculateVariantReadiness(variants, row.status);
    return record;
  });
}

// Sidebar badge for the "Brand Activity" page — Instant-Publish means a
// brand's create/update/archive is already live, so this counts
// notifications still awaiting an Approve/Revert decision, not a
// pre-publish queue. notifications has no public read policy, so this
// needs supabaseAdmin like every other notifications read.
// Recent brand-initiated product changes (create/update/archive) for the
// admin "Brand Activity" page — reuses the exact same rows the
// notification bell/page already show, just without the "read" framing.
export async function getBrandActivityNotifications(limit = 50): Promise<NotificationRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("*")
    .eq("related_entity_type", "product")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getBrandActivityNotifications failed: ${error.message}`);
  }
  return (data as NotificationRow[]).map(toNotificationRecord);
}

export async function getProductForAdmin(id: string): Promise<ProductRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`getProductForAdmin(${id}) failed: ${error.message}`);
  }
  if (!data) return null;

  const row = data as ProductRow;
  const ctx = await loadAdminProductDisplayContext([row]);
  const variantsByProduct = await getVariantsForProducts([id], supabaseAdmin);
  const variants = variantsByProduct.get(id) ?? [];
  const record = attachVariantDerivedFields(toProductRecord(row, ctx), variants);
  // Loads the Product Editor's initial Color -> image state from
  // product_media (the authoritative source — see lib/data/products.ts),
  // not the legacy product_color_images write-only compatibility table.
  const { data: colorImages } = await supabaseAdmin
    .from("product_media")
    .select("color_option_value_id, storage_reference")
    .eq("product_id", id)
    .not("color_option_value_id", "is", null);
  record.colorImages = Object.fromEntries(
    (colorImages ?? []).map((item) => [item.color_option_value_id as string, item.storage_reference as string])
  );
  record.variantReadiness = calculateVariantReadiness(variants, row.status);
  return record;
}

interface BrandRow {
  id: string;
  slug: string;
  name: string;
  category: string;
  additional_categories: string[] | null;
  is_active: boolean;
  is_mahaly_partner: boolean;
  is_sponsored: boolean;
  sponsored_placements: string[] | null;
  sponsored_order: number | null;
  founded_year: number | null;
  city: string;
  hero_image: string;
  logo_image: string | null;
  about_description: string;
  about_image: string;
  story_body: string;
  owner_user_id: string | null;
  sku_prefix: string;
  shipping_policy: string | null;
  return_policy: string | null;
  return_window_days: number | null;
}

function toBrandRecord(row: BrandRow, ownerEmail?: string, hasProducts?: boolean): BrandRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    additionalCategories: row.additional_categories ?? [],
    isActive: row.is_active,
    isMahalyPartner: row.is_mahaly_partner,
    isSponsored: row.is_sponsored,
    sponsoredPlacements: row.sponsored_placements ?? [],
    sponsoredOrder: row.sponsored_order ?? undefined,
    skuPrefix: row.sku_prefix,
    hasProducts,
    foundedYear: row.founded_year ?? undefined,
    city: row.city,
    heroImage: row.hero_image,
    logoImage: row.logo_image ?? undefined,
    aboutDescription: row.about_description,
    aboutImage: row.about_image,
    storyBody: row.story_body,
    ownerUserId: row.owner_user_id ?? undefined,
    ownerEmail,
    shippingPolicy: row.shipping_policy ?? undefined,
    returnPolicy: row.return_policy ?? undefined,
    returnWindowDays: row.return_window_days ?? undefined,
  };
}

// Which of the given brand ids currently have >=1 product — drives the
// BrandForm SKU Prefix lock display (the DB trigger is the real
// enforcement; this is read-only UI context).
async function getBrandIdsWithProducts(brandIds: string[]): Promise<Set<string>> {
  if (brandIds.length === 0) return new Set();
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("brand_id")
    .in("brand_id", brandIds);
  if (error) throw new Error(`getBrandIdsWithProducts failed: ${error.message}`);
  return new Set((data ?? []).map((row) => row.brand_id as string));
}

// owner_user_id has no email on the brands row itself — batch-look-up the
// linked accounts' emails from profiles (service-role, since profiles RLS
// only allows reading your own row) the same way variants are batched for
// a product list, rather than one query per brand.
async function getOwnerEmailsByUserId(rows: BrandRow[]): Promise<Map<string, string>> {
  const ownerIds = rows.map((r) => r.owner_user_id).filter((id): id is string => Boolean(id));
  const emailByOwner = new Map<string, string>();
  if (ownerIds.length === 0) return emailByOwner;

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .in("id", ownerIds);
  for (const p of profiles ?? []) {
    if (p.email) emailByOwner.set(p.id, p.email);
  }
  return emailByOwner;
}

// Public SELECT policy on `brands` already allows this — no service role
// needed for reads, only for the create/update/delete routes.
export async function getAllBrandsForAdmin(): Promise<BrandRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("brands")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAllBrandsForAdmin failed: ${error.message}`);
  }
  const rows = data as BrandRow[];
  const [emailByOwner, brandIdsWithProducts] = await Promise.all([
    getOwnerEmailsByUserId(rows),
    getBrandIdsWithProducts(rows.map((r) => r.id)),
  ]);
  return rows.map((row) =>
    toBrandRecord(
      row,
      row.owner_user_id ? emailByOwner.get(row.owner_user_id) : undefined,
      brandIdsWithProducts.has(row.id)
    )
  );
}

// brand_staff has no public "list everyone" policy (only `user_id =
// auth.uid()`), so the admin Users page's "who's an assistant on which
// brand" view needs the service-role client, same as every other
// admin-only cross-account read in this file.
export async function getAllBrandStaffForAdmin(): Promise<
  { userId: string; brandSlug: string; brandName: string }[]
> {
  const { data, error } = await supabaseAdmin
    .from("brand_staff")
    .select("user_id, brand_id, brands(slug, name)");

  if (error) {
    throw new Error(`getAllBrandStaffForAdmin failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as { user_id: string; brand_id: string; brands: { slug: string; name: string } | null }[]).map(
    (row) => ({
      userId: row.user_id,
      brandSlug: row.brands?.slug ?? row.brand_id,
      brandName: row.brands?.name ?? row.brand_id,
    })
  );
}

export interface BrandMemberRecord {
  id: string;
  email: string | null;
  name: string | null;
}

// Shared by the "Brand Portal Access" widget (app/admin/brands/[slug]/edit)
// and GET /api/admin/brands/[slug]/owners (the "this brand already has an
// owner" conflict check in UserAccessControl.tsx) — both need the *complete*
// membership picture (brands.owner_user_id, the "primary owner" convenience
// pointer, *and* every brand_staff access_level='owner' co-owner row,
// deduplicated), not just the primary pointer. Reading only owner_user_id
// here previously let a co-owner go completely invisible on the edit page:
// the widget showed "not linked" (or the wrong single owner) after the
// primary was unlinked, even though the co-owner still had full brand-portal
// access the whole time.
export async function getBrandMembersForAdmin(
  brandSlug: string
): Promise<{ owners: BrandMemberRecord[]; assistants: BrandMemberRecord[] } | null> {
  const { data: brand, error: brandError } = await supabaseAdmin
    .from("brands")
    .select("id, owner_user_id")
    .eq("slug", brandSlug)
    .maybeSingle();
  if (brandError) throw new Error(`getBrandMembersForAdmin(${brandSlug}) failed: ${brandError.message}`);
  if (!brand) return null;

  const { data: staffRows, error: staffError } = await supabaseAdmin
    .from("brand_staff")
    .select("user_id, access_level")
    .eq("brand_id", brand.id);
  if (staffError) throw new Error(`getBrandMembersForAdmin(${brandSlug}) failed: ${staffError.message}`);

  const ownerIds = new Set<string>();
  const assistantIds = new Set<string>();
  if (brand.owner_user_id) ownerIds.add(brand.owner_user_id);
  for (const row of staffRows ?? []) {
    if (row.access_level === "owner") ownerIds.add(row.user_id);
    else assistantIds.add(row.user_id);
  }

  const allIds = [...new Set([...ownerIds, ...assistantIds])];
  const { data: profiles, error: profilesError } = allIds.length
    ? await supabaseAdmin.from("profiles").select("id, email, full_name").in("id", allIds)
    : { data: [], error: null };
  if (profilesError) throw new Error(`getBrandMembersForAdmin(${brandSlug}) failed: ${profilesError.message}`);

  const byId = new Map((profiles ?? []).map((row) => [row.id as string, row]));
  const describe = (id: string): BrandMemberRecord => {
    const profile = byId.get(id);
    return { id, email: profile?.email ?? null, name: profile?.full_name ?? null };
  };

  return {
    owners: [...ownerIds].map(describe),
    assistants: [...assistantIds].map(describe),
  };
}

export async function getBrandForAdmin(slug: string): Promise<BrandRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("brands")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`getBrandForAdmin(${slug}) failed: ${error.message}`);
  }
  if (!data) return null;
  const row = data as BrandRow;
  const brandIdsWithProducts = await getBrandIdsWithProducts([row.id]);
  const hasProducts = brandIdsWithProducts.has(row.id);
  if (row.owner_user_id) {
    const emailByOwner = await getOwnerEmailsByUserId([row]);
    return toBrandRecord(row, emailByOwner.get(row.owner_user_id), hasProducts);
  }
  return toBrandRecord(row, undefined, hasProducts);
}

interface OrderItemRow {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  name: string;
  brand: string;
  price: number;
  currency: "USD" | "EGP";
  size: string;
  color: string | null;
  quantity: number;
  image: string;
  original_unit_price: number | null;
  discount_percent_snapshot: number | null;
  discount_source: OrderItemDiscountSource | null;
  item_coupon_discount_egp: number;
}

interface OrderRow {
  id: string;
  order_number: string;
  status: OrderStatus;
  user_id: string | null;
  shipping_name: string;
  shipping_email: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_city: string;
  shipping_governorate: string;
  subtotal_usd: number;
  subtotal_egp: number;
  internal_notes: string | null;
  coupon_code: string | null;
  discount_amount_egp: number;
  created_at: string;
  master_order_id: string;
  master_orders: { master_order_number: string } | null;
  fulfillment_type: OrderRecord["fulfillmentType"];
  brand_slug: string | null;
  shipping_fee_egp: number;
  payment_method: OrderRecord["paymentMethod"];
  payment_status: OrderRecord["paymentStatus"];
  payment_attempt_id: string | null;
  order_items: OrderItemRow[];
  order_status_history?: { id: string; status: OrderStatus; note: string | null; created_at: string }[];
}

function toOrderRecord(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    userId: row.user_id ?? undefined,
    masterOrderId: row.master_order_id,
    masterOrderNumber: row.master_orders?.master_order_number ?? "",
    fulfillmentType: row.fulfillment_type,
    brandSlug: row.brand_slug ?? undefined,
    shippingFeeEgp: Number(row.shipping_fee_egp),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    paymentAttemptId: row.payment_attempt_id ?? undefined,
    shippingName: row.shipping_name,
    shippingEmail: row.shipping_email,
    shippingPhone: row.shipping_phone,
    shippingAddress: row.shipping_address,
    shippingCity: row.shipping_city,
    shippingGovernorate: row.shipping_governorate,
    subtotalUsd: Number(row.subtotal_usd),
    subtotalEgp: Number(row.subtotal_egp),
    internalNotes: row.internal_notes ?? undefined,
    couponCode: row.coupon_code ?? undefined,
    discountAmountEgp: Number(row.discount_amount_egp),
    createdAt: row.created_at,
    items: (row.order_items ?? []).map((item) => ({
      id: item.id,
      productId: item.product_id,
      variantId: item.variant_id ?? undefined,
      name: item.name,
      brand: item.brand,
      price: Number(item.price),
      currency: item.currency,
      size: item.size,
      color: item.color ?? undefined,
      quantity: item.quantity,
      image: item.image,
      originalUnitPrice: item.original_unit_price != null ? Number(item.original_unit_price) : null,
      discountPercentSnapshot: item.discount_percent_snapshot != null ? Number(item.discount_percent_snapshot) : null,
      discountSource: item.discount_source,
      itemCouponDiscountEgp: Number(item.item_coupon_discount_egp ?? 0),
    })),
    statusHistory: (row.order_status_history ?? [])
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((h) => ({ id: h.id, status: h.status, note: h.note ?? undefined, createdAt: h.created_at })),
  };
}

const ADMIN_ORDER_SELECT =
  "*, master_orders(master_order_number), order_items(*), order_status_history(id, status, note, created_at)";

// Orders have no public/admin RLS read policy, so admin reads go through
// the service-role client directly — these functions are only ever called
// from pages already behind the requireAdminUser()/layout gate.
export async function getAllOrdersForAdmin(): Promise<OrderRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(ADMIN_ORDER_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAllOrdersForAdmin failed: ${error.message}`);
  }
  return (data as OrderRow[]).map(toOrderRecord);
}

export async function getOrderForAdmin(id: string): Promise<OrderRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(ADMIN_ORDER_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`getOrderForAdmin(${id}) failed: ${error.message}`);
  }
  if (!data) return null;
  const order = toOrderRecord(data as OrderRow);
  if (order.userId) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email, phone")
      .eq("id", order.userId)
      .maybeSingle();
    order.accountName = profile?.full_name ?? undefined;
    order.accountEmail = profile?.email ?? undefined;
    order.accountPhone = profile?.phone ?? undefined;
  }
  return order;
}

export interface SiblingOrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  fulfillmentType: "mahaly_pool" | "brand_direct";
  brandSlug: string | null;
  // Admin is explicitly allowed to see the complete master-order picture
  // (unlike Brand Portal) — these let the order detail page sum a full
  // master-order total across every shipment from the same checkout.
  subtotalEgp: number;
  discountAmountEgp: number;
  shippingFeeEgp: number;
}

// Other shipments created from the same checkout (see master_order_id) —
// the admin order detail page links to these so a multi-brand purchase's
// shipments are easy to navigate between.
export async function getSiblingOrders(masterOrderId: string, excludeOrderId: string): Promise<SiblingOrderSummary[]> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, status, fulfillment_type, brand_slug, subtotal_egp, discount_amount_egp, shipping_fee_egp")
    .eq("master_order_id", masterOrderId)
    .neq("id", excludeOrderId);

  if (error) {
    throw new Error(`getSiblingOrders(${masterOrderId}) failed: ${error.message}`);
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    orderNumber: r.order_number,
    status: r.status,
    fulfillmentType: r.fulfillment_type,
    brandSlug: r.brand_slug,
    subtotalEgp: Number(r.subtotal_egp),
    discountAmountEgp: Number(r.discount_amount_egp),
    shippingFeeEgp: Number(r.shipping_fee_egp),
  }));
}

export interface PaymentAttemptRefundReviewItem {
  paymentAttemptId: string;
  userId: string;
  status: string;
  amountCents: number;
  currency: string;
  isPartial: boolean;
  refundAmountCents: number;
  refundedAt: string | null;
  refundNote: string | null;
  createdAt: string;
  paidAt: string | null;
}

// Every card payment that was captured (paid_at set) but couldn't be fully
// turned into an order — a full failure (status = 'fulfillment_failed') or
// a partial one (status = 'fulfilled' but at least one vendor bucket
// failed) — and hasn't yet been marked as refunded. Reads through a
// SECURITY DEFINER RPC because private.payment_attempt_fulfillments (where
// refund_amount_cents/is_partial are derived from) has no PostgREST
// surface at all — see supabase/migrations/
// 20260812000001_paymob_webhook_and_paid_fulfillment.sql.
export async function getPaymentAttemptsNeedingRefundReview(): Promise<PaymentAttemptRefundReviewItem[]> {
  const { data, error } = await supabaseAdmin.rpc("list_payment_attempts_needing_refund_review");
  if (error) {
    throw new Error(`getPaymentAttemptsNeedingRefundReview failed: ${error.message}`);
  }
  return (
    (data ?? []) as {
      payment_attempt_id: string;
      user_id: string;
      status: string;
      amount_cents: number;
      currency: string;
      is_partial: boolean;
      refund_amount_cents: number;
      refunded_at: string | null;
      refund_note: string | null;
      created_at: string;
      paid_at: string | null;
    }[]
  ).map((row) => ({
    paymentAttemptId: row.payment_attempt_id,
    userId: row.user_id,
    status: row.status,
    amountCents: row.amount_cents,
    currency: row.currency,
    isPartial: row.is_partial,
    refundAmountCents: row.refund_amount_cents,
    refundedAt: row.refunded_at,
    refundNote: row.refund_note,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  }));
}

export interface PaymentAttemptListItem {
  id: string;
  specialReference: string;
  userId: string;
  userEmail: string | null;
  amountCents: number;
  currency: string;
  status: string;
  masterOrderId: string | null;
  masterOrderNumber: string | null;
  createdAt: string;
  paidAt: string | null;
}

interface PaymentAttemptListRow {
  id: string;
  special_reference: string;
  user_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  master_order_id: string | null;
  master_orders: { master_order_number: string } | null;
  created_at: string;
  paid_at: string | null;
}

// payment_attempts has no admin-read RLS bypass (owner-only, same as
// orders) — every admin read here goes through supabaseAdmin, same
// convention as getAllOrdersForAdmin. user_id -> email needs a separate
// batch lookup (payment_attempts has no direct FK PostgREST can embed
// profiles through), matching getOwnerEmailsByUserId's pattern above.
export async function getAllPaymentAttemptsForAdmin(): Promise<PaymentAttemptListItem[]> {
  const { data, error } = await supabaseAdmin
    .from("payment_attempts")
    .select("id, special_reference, user_id, amount_cents, currency, status, master_order_id, master_orders(master_order_number), created_at, paid_at")
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`getAllPaymentAttemptsForAdmin failed: ${error.message}`);
  }
  const rows = (data ?? []) as unknown as PaymentAttemptListRow[];

  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const emailByUser = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, email").in("id", userIds);
    for (const p of profiles ?? []) {
      if (p.email) emailByUser.set(p.id, p.email);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    specialReference: row.special_reference,
    userId: row.user_id,
    userEmail: emailByUser.get(row.user_id) ?? null,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    masterOrderId: row.master_order_id,
    masterOrderNumber: row.master_orders?.master_order_number ?? null,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  }));
}

export interface PaymentAttemptFulfillmentBucket {
  bucketKey: string;
  brandId: string | null;
  brandName: string | null;
  brandSlug: string | null;
  status: string;
  orderId: string | null;
  expectedAmountCents: number;
  failureReason: string | null;
  fulfilledAt: string | null;
}

export interface PaymentAttemptDetail extends PaymentAttemptListItem {
  provider: string;
  providerIntentionId: string | null;
  providerOrderId: number | null;
  providerTransactionId: string | null;
  failureReason: string | null;
  itemCount: number;
  refundedAt: string | null;
  refundNote: string | null;
  updatedAt: string;
  expiresAt: string;
  processedAt: string | null;
  siblingOrders: { id: string; orderNumber: string; status: string; brandSlug: string | null }[];
  buckets: PaymentAttemptFulfillmentBucket[];
}

// Detail view for /admin/payments/[id] — the full row plus its linked
// orders (via master_order_id, same shape as getSiblingOrders) and its
// per-bucket fulfillment ledger (list_payment_attempt_fulfillments_for_admin,
// the one genuinely new piece of admin visibility this page adds —
// private.payment_attempt_fulfillments has no other PostgREST/RPC surface).
export async function getPaymentAttemptForAdmin(id: string): Promise<PaymentAttemptDetail | null> {
  const { data, error } = await supabaseAdmin
    .from("payment_attempts")
    .select(
      "id, special_reference, user_id, amount_cents, currency, status, master_order_id, master_orders(master_order_number), created_at, paid_at, provider, provider_intention_id, provider_order_id, provider_transaction_id, failure_reason, cart_snapshot, refunded_at, refund_note, updated_at, expires_at, processed_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`getPaymentAttemptForAdmin(${id}) failed: ${error.message}`);
  }
  if (!data) return null;
  const row = data as unknown as PaymentAttemptListRow & {
    provider: string;
    provider_intention_id: string | null;
    provider_order_id: number | null;
    provider_transaction_id: string | null;
    failure_reason: string | null;
    cart_snapshot: unknown[];
    refunded_at: string | null;
    refund_note: string | null;
    updated_at: string;
    expires_at: string;
    processed_at: string | null;
  };

  const [{ data: profile }, siblingOrders, bucketsResult] = await Promise.all([
    supabaseAdmin.from("profiles").select("email").eq("id", row.user_id).maybeSingle(),
    row.master_order_id
      ? supabaseAdmin.from("orders").select("id, order_number, status, brand_slug").eq("master_order_id", row.master_order_id)
      : Promise.resolve({ data: [] as { id: string; order_number: string; status: string; brand_slug: string | null }[] }),
    supabaseAdmin.rpc("list_payment_attempt_fulfillments_for_admin", { p_payment_attempt_id: id }),
  ]);

  if (bucketsResult.error) {
    throw new Error(`getPaymentAttemptForAdmin(${id}) buckets failed: ${bucketsResult.error.message}`);
  }
  const bucketRows = (bucketsResult.data ?? []) as {
    bucket_key: string;
    brand_id: string | null;
    brand_name: string | null;
    brand_slug: string | null;
    status: string;
    order_id: string | null;
    expected_amount_cents: number;
    failure_reason: string | null;
    fulfilled_at: string | null;
  }[];

  return {
    id: row.id,
    specialReference: row.special_reference,
    userId: row.user_id,
    userEmail: profile?.email ?? null,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    masterOrderId: row.master_order_id,
    masterOrderNumber: row.master_orders?.master_order_number ?? null,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    provider: row.provider,
    providerIntentionId: row.provider_intention_id,
    providerOrderId: row.provider_order_id,
    providerTransactionId: row.provider_transaction_id,
    failureReason: row.failure_reason,
    itemCount: Array.isArray(row.cart_snapshot) ? row.cart_snapshot.length : 0,
    refundedAt: row.refunded_at,
    refundNote: row.refund_note,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    processedAt: row.processed_at,
    siblingOrders: (siblingOrders.data ?? []).map((o) => ({
      id: o.id,
      orderNumber: o.order_number,
      status: o.status,
      brandSlug: o.brand_slug,
    })),
    buckets: bucketRows.map((b) => ({
      bucketKey: b.bucket_key,
      brandId: b.brand_id,
      brandName: b.brand_name,
      brandSlug: b.brand_slug,
      status: b.status,
      orderId: b.order_id,
      expectedAmountCents: b.expected_amount_cents,
      failureReason: b.failure_reason,
      fulfilledAt: b.fulfilled_at,
    })),
  };
}

// Row-mapping lives in lib/join/applicationService.ts (shared with the
// applicant routes) so the admin and applicant sides never drift onto two
// different shapes for the same table.
export async function getAllApplicationsForAdmin(): Promise<BrandApplicationRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("brand_applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAllApplicationsForAdmin failed: ${error.message}`);
  }
  return (data ?? []).map(toBrandApplicationRecord);
}

export async function getApplicationForAdmin(
  id: string
): Promise<BrandApplicationRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("brand_applications")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`getApplicationForAdmin(${id}) failed: ${error.message}`);
  }
  if (!data) return null;
  return toBrandApplicationRecord(data);
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  is_admin: boolean;
  role: ProfileRole;
  created_at: string;
}

function toProfileRecord(row: ProfileRow): ProfileRecord {
  return {
    id: row.id,
    fullName: row.full_name ?? undefined,
    email: row.email ?? undefined,
    isAdmin: row.is_admin,
    role: row.role,
    createdAt: row.created_at,
  };
}

// profiles RLS only allows a user to read their own row — admin's "list
// every account" view needs the service-role client too.
export async function getAllProfilesForAdmin(): Promise<ProfileRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAllProfilesForAdmin failed: ${error.message}`);
  }
  return (data as ProfileRow[]).map(toProfileRecord);
}

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  audit_log_id: string | null;
  resolution: string;
}

function toNotificationRecord(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    read: row.read,
    createdAt: row.created_at,
    relatedEntityType: row.related_entity_type ?? undefined,
    relatedEntityId: row.related_entity_id ?? undefined,
    auditLogId: row.audit_log_id ?? undefined,
    resolution: (row.resolution as NotificationRecord["resolution"]) ?? "n/a",
  };
}

// notifications has no public policy at all — admin-only, service-role reads.
export async function getAllNotificationsForAdmin(limit = 50): Promise<NotificationRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getAllNotificationsForAdmin failed: ${error.message}`);
  }
  return (data as NotificationRow[]).map(toNotificationRecord);
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("read", false);

  if (error) {
    throw new Error(`getUnreadNotificationCount failed: ${error.message}`);
  }
  return count ?? 0;
}

interface AuditLogRow {
  id: string;
  actor_id: string | null;
  actor_label: string;
  entity_type: string;
  entity_id: string;
  action: string;
  before_value: unknown;
  after_value: unknown;
  created_at: string;
  brand_slug: string | null;
}

function toAuditLogRecord(row: AuditLogRow, nameByActorId?: Map<string, string>): AuditLogRecord {
  return {
    id: row.id,
    actorId: row.actor_id ?? undefined,
    actorLabel: row.actor_label,
    actorName: row.actor_id ? nameByActorId?.get(row.actor_id) : undefined,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    beforeValue: row.before_value,
    afterValue: row.after_value,
    createdAt: row.created_at,
    brandSlug: row.brand_slug ?? undefined,
  };
}

// Same batching convention as getOwnerEmailsByUserId — one query for every
// distinct actor across the page of rows, not one per row.
async function getFullNamesByActorId(rows: AuditLogRow[]): Promise<Map<string, string>> {
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((id): id is string => Boolean(id)))];
  const nameByActorId = new Map<string, string>();
  if (actorIds.length === 0) return nameByActorId;

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name")
    .in("id", actorIds);
  for (const p of profiles ?? []) {
    if (p.full_name) nameByActorId.set(p.id, p.full_name);
  }
  return nameByActorId;
}

export interface AuditLogFilters {
  entityType?: string;
  action?: string;
  actorQuery?: string;
  dateFrom?: string;
  dateTo?: string;
}

// audit_logs has no public policy at all — admin-only, service-role reads.
export async function getAllAuditLogsForAdmin(
  limit = 200,
  filters?: AuditLogFilters
): Promise<AuditLogRecord[]> {
  let query = supabaseAdmin
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters?.entityType) query = query.eq("entity_type", filters.entityType);
  if (filters?.action) query = query.eq("action", filters.action);
  if (filters?.actorQuery) query = query.ilike("actor_label", `%${filters.actorQuery}%`);
  if (filters?.dateFrom) query = query.gte("created_at", filters.dateFrom);
  // Inclusive of the whole "to" day, since the column is a timestamptz and
  // a bare date would otherwise cut off at midnight.
  if (filters?.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);

  const { data, error } = await query;

  if (error) {
    throw new Error(`getAllAuditLogsForAdmin failed: ${error.message}`);
  }
  const rows = data as AuditLogRow[];
  const nameByActorId = await getFullNamesByActorId(rows);
  return rows.map((row) => toAuditLogRecord(row, nameByActorId));
}

// A brand's own oversight log (Round 3) — scoped to just their entries via
// the denormalized brand_slug tag, visible to the owner only. Nothing
// logged before that column existed will appear here, same "tag going
// forward only" principle as order_items.brand_slug.
export async function getAuditLogsForBrand(
  brandSlug: string,
  limit = 100
): Promise<AuditLogRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("audit_logs")
    .select("*")
    .eq("brand_slug", brandSlug)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getAuditLogsForBrand(${brandSlug}) failed: ${error.message}`);
  }
  const rows = data as AuditLogRow[];
  const nameByActorId = await getFullNamesByActorId(rows);
  return rows.map((row) => toAuditLogRecord(row, nameByActorId));
}

interface LowStockVariantRow {
  id: string;
  product_id: string;
  quantity: number;
  low_stock_threshold_override: number | null;
  selling_status: SellingStatus;
  products: { id: string; name: string; brand_name: string; image: string; default_low_stock_threshold: number } | null;
}

// Small catalog, so filtering "at or below threshold" in memory after one
// query is simpler and just as fast as a raw column-to-column comparison
// (PostgREST filters can't compare quantity to another column directly).
export async function getLowStockVariantsForAdmin(): Promise<LowStockVariantRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("product_variants")
    .select(
      "id, product_id, quantity, low_stock_threshold_override, selling_status, products(id, name, brand_name, image, default_low_stock_threshold)"
    )
    .eq("selling_status", "active")
    .eq("is_archived", false)
    .order("quantity", { ascending: true });

  if (error) {
    throw new Error(`getLowStockVariantsForAdmin failed: ${error.message}`);
  }

  const rows = ((data as unknown as LowStockVariantRow[]) ?? []).filter((row) => row.products);
  const variantsByProduct = await getVariantsForProducts(
    [...new Set(rows.map((row) => row.product_id))],
    supabaseAdmin
  );
  const optionValuesByVariant = new Map(
    [...variantsByProduct.values()].flat().map((v) => [v.id, v.optionValues])
  );

  return rows
    .map((row) => {
      const threshold = effectiveLowStockThreshold(
        row.low_stock_threshold_override,
        row.products!.default_low_stock_threshold
      );
      const stockStatus = calculateStockStatus(row.quantity, threshold);
      const optionValues = optionValuesByVariant.get(row.id) ?? [];
      return {
        variantId: row.id,
        productId: row.product_id,
        productName: row.products!.name,
        brandName: row.products!.brand_name,
        image: row.products!.image,
        color: optionValues.find((o) => o.optionTypeName === "Color")?.label,
        size: optionValues.find((o) => o.optionTypeName === "Size")?.label,
        quantity: row.quantity,
        lowStockThreshold: threshold,
        sellingStatus: row.selling_status,
        stockStatus,
      };
    })
    .filter((v) => v.stockStatus !== "in_stock");
}

export interface AdminInventoryOverview {
  totalVariantCount: number;
  totalAvailableUnits: number;
  healthyCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  openTransferCount: number;
  incomingUnitCount: number;
  movementsLast24Hours: number;
  brands: string[];
}

type InventoryOverviewVariantRow = {
  quantity: number;
  low_stock_threshold_override: number | null;
  products: { default_low_stock_threshold: number; brand_name: string } | null;
};

type InventoryOverviewTransferRow = {
  id: string;
  warehouse_transfer_items: Array<{ requested_qty: number; received_ok_qty: number | null }>;
};

export async function getInventoryOverviewForAdmin(): Promise<AdminInventoryOverview> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const openWarehouseStatuses = ["pending", "submitted", "approved", "in_transit", "receiving", "partially_received"];
  const [variantsResult, transfersResult, movementsResult] = await Promise.all([
    supabaseAdmin
      .from("product_variants")
      .select("quantity, low_stock_threshold_override, products!inner(default_low_stock_threshold, brand_name)")
      .eq("selling_status", "active")
      .eq("is_archived", false),
    supabaseAdmin
      .from("warehouse_transfers")
      .select("id, warehouse_transfer_items(requested_qty, received_ok_qty)")
      .eq("direction", "to_local")
      .in("status", openWarehouseStatuses),
    supabaseAdmin
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
  ]);

  if (variantsResult.error) throw new Error(`getInventoryOverviewForAdmin variants failed: ${variantsResult.error.message}`);
  if (transfersResult.error) throw new Error(`getInventoryOverviewForAdmin transfers failed: ${transfersResult.error.message}`);
  if (movementsResult.error) throw new Error(`getInventoryOverviewForAdmin movements failed: ${movementsResult.error.message}`);

  const variants = (variantsResult.data ?? []) as unknown as InventoryOverviewVariantRow[];
  const transfers = (transfersResult.data ?? []) as unknown as InventoryOverviewTransferRow[];
  let healthyCount = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  for (const variant of variants) {
    if (!variant.products) continue;
    const threshold = effectiveLowStockThreshold(
      variant.low_stock_threshold_override,
      variant.products.default_low_stock_threshold
    );
    const status = calculateStockStatus(variant.quantity, threshold);
    if (status === "out_of_stock") outOfStockCount += 1;
    else if (status === "low_stock") lowStockCount += 1;
    else healthyCount += 1;
  }

  return {
    totalVariantCount: variants.length,
    totalAvailableUnits: variants.reduce((sum, variant) => sum + Number(variant.quantity), 0),
    healthyCount,
    lowStockCount,
    outOfStockCount,
    openTransferCount: transfers.length,
    incomingUnitCount: transfers.reduce((sum, transfer) => sum + transfer.warehouse_transfer_items.reduce(
      (itemSum, item) => itemSum + (item.received_ok_qty == null ? Number(item.requested_qty) : 0),
      0
    ), 0),
    movementsLast24Hours: movementsResult.count ?? 0,
    brands: [...new Set(variants.map((variant) => variant.products?.brand_name).filter((brand): brand is string => Boolean(brand)))].sort(),
  };
}

export async function getAuditLogsForEntity(
  entityType: string,
  entityId: string
): Promise<AuditLogRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("audit_logs")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAuditLogsForEntity(${entityType}, ${entityId}) failed: ${error.message}`);
  }
  const rows = data as AuditLogRow[];
  const nameByActorId = await getFullNamesByActorId(rows);
  return rows.map((row) => toAuditLogRecord(row, nameByActorId));
}

interface CouponRow {
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  active: boolean;
  created_at: string;
}

function toCouponRecord(row: CouponRow): CouponRecord {
  return {
    code: row.code,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    maxUses: row.max_uses ?? undefined,
    usedCount: row.used_count,
    expiresAt: row.expires_at ?? undefined,
    active: row.active,
    createdAt: row.created_at,
  };
}

// coupons has no public policy — never exposed to the anon key (a public
// SELECT would let anyone list every valid code), admin-only service-role reads.
export async function getAllCouponsForAdmin(): Promise<CouponRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAllCouponsForAdmin failed: ${error.message}`);
  }
  return (data as CouponRow[]).map(toCouponRecord);
}

export async function getCouponForAdmin(code: string): Promise<CouponRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("coupons")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (error) {
    throw new Error(`getCouponForAdmin(${code}) failed: ${error.message}`);
  }
  if (!data) return null;
  return toCouponRecord(data as CouponRow);
}

// Used by the admin content forms both to prefill with the currently-live
// value (custom or still the static default — the caller merges in its own
// fallback) and to show a "Customized" badge with a last-edited timestamp.
export async function getSiteContentRowForAdmin(
  key: string
): Promise<{ value: unknown; updatedAt: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("site_content")
    .select("value, updated_at")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    throw new Error(`getSiteContentRowForAdmin(${key}) failed: ${error.message}`);
  }
  if (!data) return null;
  return { value: data.value, updatedAt: data.updated_at };
}

// Admin view of the full taxonomy tree (/admin/products/categories) —
// unlike lib/data/taxonomy.ts's getTaxonomyTree(), this includes inactive
// nodes too, since "display... Active status" is the point of this view.
export async function getFullTaxonomyTreeForAdmin(): Promise<TaxonomyNode[]> {
  const { data, error } = await supabaseAdmin
    .from("taxonomy_nodes")
    .select("id, parent_id, level, name, slug, sort_order, is_active")
    .order("level", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`getFullTaxonomyTreeForAdmin failed: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    parentId: row.parent_id as string | null,
    level: row.level as TaxonomyLevel,
    name: row.name as string,
    slug: row.slug as string,
    sortOrder: row.sort_order as number,
    isActive: row.is_active as boolean,
  }));
}

export interface AdminInventoryMovementRow {
  id: string;
  productId: string;
  productName: string;
  variantImage: string;
  brandName: string;
  variantId: string;
  variantSku: string;
  variantLabel: string;
  previousQuantity: number;
  quantityDelta: number;
  newQuantity: number;
  movementType: string;
  reason: string;
  note: string | null;
  source: string;
  createdAt: string;
}

export async function getInventoryMovementsForAdmin(options: {
  productId?: string;
  q?: string;
  brand?: string;
  source?: string;
  movementType?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{ rows: AdminInventoryMovementRow[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let scopedProductIds: string[] | null = null;
  if (options.brand || options.q) {
    let brandProductIds: string[] | null = null;
    if (options.brand) {
      const { data, error } = await supabaseAdmin.from("products").select("id").eq("brand_name", options.brand);
      if (error) throw new Error(`getInventoryMovementsForAdmin brand scope failed: ${error.message}`);
      brandProductIds = (data ?? []).map((product) => product.id as string);
    }

    let queryProductIds: string[] | null = null;
    if (options.q) {
      const pattern = `%${options.q}%`;
      const [names, brands, variants] = await Promise.all([
        supabaseAdmin.from("products").select("id").ilike("name", pattern),
        supabaseAdmin.from("products").select("id").ilike("brand_name", pattern),
        supabaseAdmin.from("product_variants").select("product_id").ilike("sku", pattern),
      ]);
      for (const result of [names, brands, variants]) {
        if (result.error) throw new Error(`getInventoryMovementsForAdmin search scope failed: ${result.error.message}`);
      }
      queryProductIds = [...new Set([
        ...(names.data ?? []).map((product) => product.id as string),
        ...(brands.data ?? []).map((product) => product.id as string),
        ...(variants.data ?? []).map((variant) => variant.product_id as string),
      ])];
    }

    const queryProductIdSet = queryProductIds ? new Set(queryProductIds) : null;
    scopedProductIds = brandProductIds && queryProductIdSet
      ? brandProductIds.filter((id) => queryProductIdSet.has(id))
      : brandProductIds ?? queryProductIds ?? [];

    if (scopedProductIds.length === 0) return { rows: [], total: 0, page, limit };
  }

  let query = supabaseAdmin
    .from("inventory_movements")
    .select("id, product_id, variant_id, previous_quantity, quantity_delta, new_quantity, movement_type, reason, note, source, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (options.productId) query = query.eq("product_id", options.productId);
  if (scopedProductIds) query = query.in("product_id", scopedProductIds);
  if (options.source) query = query.eq("source", options.source);
  if (options.movementType) query = query.eq("movement_type", options.movementType);
  if (options.from) query = query.gte("created_at", `${options.from}T00:00:00.000Z`);
  if (options.to) query = query.lte("created_at", `${options.to}T23:59:59.999Z`);

  const { data, error, count } = await query;
  if (error) throw new Error(`getInventoryMovementsForAdmin failed: ${error.message}`);

  const productIds = [...new Set((data ?? []).map((row) => row.product_id))];
  const [productsResult, variantsByProduct, mediaResult] = await Promise.all([
    productIds.length
      ? supabaseAdmin.from("products").select("id, name, image, brand_name").in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
    getVariantsForProducts(productIds, supabaseAdmin),
    productIds.length
      ? supabaseAdmin
        .from("product_media")
        .select("product_id, storage_reference, color_option_value_id")
        .in("product_id", productIds)
        .eq("is_archived", false)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (productsResult.error) throw new Error(`getInventoryMovementsForAdmin products failed: ${productsResult.error.message}`);
  if (mediaResult.error) throw new Error(`getInventoryMovementsForAdmin media failed: ${mediaResult.error.message}`);

  const products = new Map((productsResult.data ?? []).map((product) => [product.id, product]));
  const variants = new Map([...variantsByProduct.values()].flat().map((variant) => [variant.id, variant]));
  const colorImages = buildColorImageLookup(mediaResult.data ?? []);

  return {
    rows: (data ?? []).map((row) => {
      const product = products.get(row.product_id);
      const variant = variants.get(row.variant_id);
      return {
        id: row.id,
        productId: row.product_id,
        productName: product?.name ?? row.product_id,
        variantImage: resolveVariantImage(row.product_id, variant, colorImages, product?.image),
        brandName: product?.brand_name ?? "Unknown brand",
        variantId: row.variant_id,
        variantSku: variant?.sku ?? row.variant_id,
        variantLabel: variant?.optionValues.map((value) => value.label).join(" / ") || "Default variant",
        previousQuantity: Number(row.previous_quantity),
        quantityDelta: Number(row.quantity_delta),
        newQuantity: Number(row.new_quantity),
        movementType: row.movement_type,
        reason: row.reason,
        note: row.note ?? null,
        source: row.source,
        createdAt: row.created_at,
      };
    }),
    total: count ?? 0,
    page,
    limit,
  };
}
