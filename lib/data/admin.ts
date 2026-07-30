import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVariantsForProducts } from "@/lib/data/variants";
import { attachVariantDerivedFields } from "@/lib/data/products";
import { toBrandApplicationRecord } from "@/lib/join/applicationService";
import { resolveTaxonomyPath } from "@/lib/data/taxonomy";
import { calculateVariantReadiness } from "@/lib/inventory/readiness";
import { calculateStockStatus, effectiveLowStockThreshold } from "@/lib/inventory/stockStatus";
import {
  Audience,
  AuditLogRecord,
  BrandApplicationRecord,
  BrandCategoryTab,
  BrandInfoBadge,
  BrandRecord,
  BrandShopTheLookTile,
  BrandValue,
  CouponRecord,
  LowStockVariantRecord,
  NotificationRecord,
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
  compare_at_price: number | null;
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
  pending_changes: Record<string, unknown> | null;
  review_notes: string | null;
  submitted_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  deletion_requested_at: string | null;
  paused_by_brand: boolean;
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
    compareAtPrice: row.compare_at_price != null ? Number(row.compare_at_price) : undefined,
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
    pendingChanges: row.pending_changes,
    reviewNotes: row.review_notes ?? undefined,
    submittedBy: row.submitted_by ?? undefined,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    deletionRequestedAt: row.deletion_requested_at ?? undefined,
    pausedByBrand: row.paused_by_brand,
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
export async function getUnresolvedBrandActivityCount(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("related_entity_type", "product")
    .eq("resolution", "pending");

  if (error) {
    throw new Error(`getUnresolvedBrandActivityCount failed: ${error.message}`);
  }
  return count ?? 0;
}

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
  tagline: string;
  category: string;
  is_active: boolean;
  founded_year: number | null;
  city: string;
  hero_image: string;
  logo_image: string | null;
  website_url: string | null;
  about_description: string;
  about_image: string;
  story_image: string;
  story_image_2: string | null;
  story_body: string;
  info_badges: BrandInfoBadge[];
  category_tabs: BrandCategoryTab[];
  active_tab: string;
  values: BrandValue[];
  similar_brand_slugs: string[];
  shop_the_look: BrandShopTheLookTile[];
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
    tagline: row.tagline,
    category: row.category,
    isActive: row.is_active,
    skuPrefix: row.sku_prefix,
    hasProducts,
    foundedYear: row.founded_year ?? undefined,
    city: row.city,
    heroImage: row.hero_image,
    logoImage: row.logo_image ?? undefined,
    websiteUrl: row.website_url ?? undefined,
    aboutDescription: row.about_description,
    aboutImage: row.about_image,
    storyImage: row.story_image,
    storyImage2: row.story_image_2 ?? undefined,
    storyBody: row.story_body,
    infoBadges: row.info_badges ?? [],
    categoryTabs: row.category_tabs ?? [],
    activeTab: row.active_tab,
    values: row.values ?? [],
    similarBrandSlugs: row.similar_brand_slugs ?? [],
    shopTheLook: row.shop_the_look ?? [],
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
  order_items: OrderItemRow[];
}

function toOrderRecord(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    userId: row.user_id ?? undefined,
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
    })),
  };
}

// Orders have no public/admin RLS read policy, so admin reads go through
// the service-role client directly — these functions are only ever called
// from pages already behind the requireAdminUser()/layout gate.
export async function getAllOrdersForAdmin(): Promise<OrderRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("*, order_items(*)")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAllOrdersForAdmin failed: ${error.message}`);
  }
  return (data as OrderRow[]).map(toOrderRecord);
}

export async function getOrderForAdmin(id: string): Promise<OrderRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`getOrderForAdmin(${id}) failed: ${error.message}`);
  }
  if (!data) return null;
  return toOrderRecord(data as OrderRow);
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
    relatedEntityType: row.related_entity_type === "product" ? "product" : undefined,
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
