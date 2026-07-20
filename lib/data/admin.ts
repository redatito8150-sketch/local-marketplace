import { supabase } from "@/lib/supabase/client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVariantsForProducts } from "@/lib/data/variants";
import {
  ApplicationStatus,
  AuditLogRecord,
  BrandApplicationRecord,
  BrandCategoryTab,
  BrandInfoBadge,
  BrandRecord,
  BrandValue,
  CategorySlug,
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
} from "@/types";

interface ProductRow {
  id: string;
  name: string;
  brand_name: string;
  brand_slug: string | null;
  category: CategorySlug | null;
  product_category: string | null;
  product_type: string | null;
  collection: string | null;
  material: string | null;
  fit: string | null;
  price: number;
  compare_at_price: number | null;
  currency: "USD" | "EGP";
  image: string;
  images: string[];
  colors: ProductColorOption[];
  sizes: string[];
  description: string;
  details: string[];
  care_instructions: string[];
  shipping_returns: string;
  model_height: string | null;
  model_wearing: string | null;
  sku: string;
  in_stock: boolean;
  is_new: boolean;
  is_unisex: boolean;
  unavailable_sizes: string[];
  track_inventory: boolean;
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

function toProductRecord(row: ProductRow): ProductRecord {
  return {
    id: row.id,
    name: row.name,
    brandName: row.brand_name,
    brandSlug: row.brand_slug ?? undefined,
    category: row.category ?? undefined,
    productCategory: row.product_category ?? undefined,
    productType: row.product_type ?? undefined,
    collection: row.collection ?? undefined,
    material: row.material ?? undefined,
    fit: row.fit ?? undefined,
    price: Number(row.price),
    compareAtPrice: row.compare_at_price != null ? Number(row.compare_at_price) : undefined,
    currency: row.currency,
    image: row.image,
    images: row.images ?? [],
    colors: row.colors ?? [],
    sizes: row.sizes ?? [],
    unavailableSizes: row.unavailable_sizes ?? [],
    description: row.description,
    details: row.details ?? [],
    careInstructions: row.care_instructions ?? [],
    shippingReturns: row.shipping_returns,
    modelHeight: row.model_height ?? undefined,
    modelWearing: row.model_wearing ?? undefined,
    sku: row.sku,
    inStock: row.in_stock,
    isNew: row.is_new,
    isUnisex: row.is_unisex,
    trackInventory: row.track_inventory,
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
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAllProductsForAdmin failed: ${error.message}`);
  }
  return (data as ProductRow[]).map(toProductRecord);
}

// Lightweight counts for the sidebar badge — a dedicated head-count query
// per bucket rather than fetching every product's full row on every admin
// page load (getAllProductsForAdmin is for the products list itself).
export async function getReviewQueueCount(): Promise<number> {
  const [newSubmissions, pendingEdits, deletionRequests] = await Promise.all([
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_review")
      .is("pending_changes", null),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .not("pending_changes", "is", null),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .not("deletion_requested_at", "is", null),
  ]);

  return (
    (newSubmissions.count ?? 0) + (pendingEdits.count ?? 0) + (deletionRequests.count ?? 0)
  );
}

export async function getProductForAdmin(id: string): Promise<ProductRecord | null> {
  const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();

  if (error) {
    throw new Error(`getProductForAdmin(${id}) failed: ${error.message}`);
  }
  if (!data) return null;

  const record = toProductRecord(data as ProductRow);
  const variantsByProduct = await getVariantsForProducts([id]);
  record.variants = variantsByProduct.get(id) ?? [];
  return record;
}

interface BrandRow {
  slug: string;
  name: string;
  tagline: string;
  category: string;
  founded_year: number | null;
  city: string;
  hero_image: string;
  about_description: string;
  about_image: string;
  story_image: string;
  story_body: string;
  info_badges: BrandInfoBadge[];
  category_tabs: BrandCategoryTab[];
  active_tab: string;
  values: BrandValue[];
  similar_brand_slugs: string[];
  owner_user_id: string | null;
}

function toBrandRecord(row: BrandRow, ownerEmail?: string): BrandRecord {
  return {
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    category: row.category,
    foundedYear: row.founded_year ?? undefined,
    city: row.city,
    heroImage: row.hero_image,
    aboutDescription: row.about_description,
    aboutImage: row.about_image,
    storyImage: row.story_image,
    storyBody: row.story_body,
    infoBadges: row.info_badges ?? [],
    categoryTabs: row.category_tabs ?? [],
    activeTab: row.active_tab,
    values: row.values ?? [],
    similarBrandSlugs: row.similar_brand_slugs ?? [],
    ownerUserId: row.owner_user_id ?? undefined,
    ownerEmail,
  };
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
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAllBrandsForAdmin failed: ${error.message}`);
  }
  const rows = data as BrandRow[];
  const emailByOwner = await getOwnerEmailsByUserId(rows);
  return rows.map((row) =>
    toBrandRecord(row, row.owner_user_id ? emailByOwner.get(row.owner_user_id) : undefined)
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
    .select("user_id, brand_slug, brands(name)");

  if (error) {
    throw new Error(`getAllBrandStaffForAdmin failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as { user_id: string; brand_slug: string; brands: { name: string } | null }[]).map(
    (row) => ({
      userId: row.user_id,
      brandSlug: row.brand_slug,
      brandName: row.brands?.name ?? row.brand_slug,
    })
  );
}

export async function getBrandForAdmin(slug: string): Promise<BrandRecord | null> {
  const { data, error } = await supabase.from("brands").select("*").eq("slug", slug).maybeSingle();

  if (error) {
    throw new Error(`getBrandForAdmin(${slug}) failed: ${error.message}`);
  }
  if (!data) return null;
  const row = data as BrandRow;
  if (row.owner_user_id) {
    const emailByOwner = await getOwnerEmailsByUserId([row]);
    return toBrandRecord(row, emailByOwner.get(row.owner_user_id));
  }
  return toBrandRecord(data as BrandRow);
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

interface BrandApplicationRow {
  id: string;
  brand_name: string;
  founder_name: string;
  email: string;
  phone: string;
  instagram_or_website: string;
  product_category: string;
  brand_story: string;
  sales_channels: string;
  status: ApplicationStatus;
  created_at: string;
}

function toBrandApplicationRecord(row: BrandApplicationRow): BrandApplicationRecord {
  return {
    id: row.id,
    brandName: row.brand_name,
    founderName: row.founder_name,
    email: row.email,
    phone: row.phone,
    instagramOrWebsite: row.instagram_or_website,
    productCategory: row.product_category,
    brandStory: row.brand_story,
    salesChannels: row.sales_channels,
    status: row.status,
    createdAt: row.created_at,
  };
}

// brand_applications also has no public policy — service-role reads only.
export async function getAllApplicationsForAdmin(): Promise<BrandApplicationRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("brand_applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAllApplicationsForAdmin failed: ${error.message}`);
  }
  return (data as BrandApplicationRow[]).map(toBrandApplicationRecord);
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
  return toBrandApplicationRecord(data as BrandApplicationRow);
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
}

function toNotificationRecord(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    read: row.read,
    createdAt: row.created_at,
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

// audit_logs has no public policy at all — admin-only, service-role reads.
export async function getAllAuditLogsForAdmin(limit = 200): Promise<AuditLogRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getAllAuditLogsForAdmin failed: ${error.message}`);
  }
  const rows = data as AuditLogRow[];
  const nameByActorId = await getFullNamesByActorId(rows);
  return rows.map((row) => toAuditLogRecord(row, nameByActorId));
}

interface LowStockVariantRow {
  id: string;
  product_id: string;
  color: string | null;
  size: string | null;
  quantity: number;
  low_stock_threshold: number;
  products: { id: string; name: string; brand_name: string; image: string } | null;
}

// Small catalog, so filtering "at or below threshold" in memory after one
// query is simpler and just as fast as a raw column-to-column comparison
// (PostgREST filters can't compare quantity to another column directly).
export async function getLowStockVariantsForAdmin(): Promise<LowStockVariantRecord[]> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("id, product_id, color, size, quantity, low_stock_threshold, products(id, name, brand_name, image)")
    .eq("availability_status", "available")
    .order("quantity", { ascending: true });

  if (error) {
    throw new Error(`getLowStockVariantsForAdmin failed: ${error.message}`);
  }

  return ((data as unknown as LowStockVariantRow[]) ?? [])
    .filter((row) => row.quantity <= row.low_stock_threshold && row.products)
    .map((row) => ({
      variantId: row.id,
      productId: row.product_id,
      productName: row.products!.name,
      brandName: row.products!.brand_name,
      image: row.products!.image,
      color: row.color ?? undefined,
      size: row.size ?? undefined,
      quantity: row.quantity,
      lowStockThreshold: row.low_stock_threshold,
    }));
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
