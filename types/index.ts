export type CategorySlug = "women" | "men" | "kids";

export interface CategoryHeroContent {
  slug: CategorySlug;
  title: string;
  description: string;
  ctaLabel: string;
  heroImage: string;
}

export interface CollectionCardContent {
  id: string;
  title: string;
  ctaLabel: string;
  image: string;
  href: string;
}

export interface FeaturedBrandContent {
  heading: string;
  description: string;
  ctaLabel: string;
  image: string;
  href?: string;
}

export interface CategoryContent {
  slug: CategorySlug;
  label: string;
  hero: CategoryHeroContent;
  collectionCards: CollectionCardContent[];
  featuredBrand: FeaturedBrandContent;
}

// Admin-editable marketing copy (Phase 11 CMS) — each shape mirrors the
// subset of its content/*.ts static export that's safe to edit from a
// plain-text admin form. Images/structural fields stay code-only.
export interface HomeHeroContent {
  headingLines: string[];
  subheading: string;
  ctaLabel: string;
  ctaHref?: string;
}

// Round 5 homepage sections — unlike HomeHeroContent above, these carry
// images too: the owner explicitly asked to control tile pictures, not
// just copy, from Site Content.
export interface HeroTileContent {
  label: string;
  href: string;
  image: string;
}

export type HomeHeroTilesContent = Record<"women" | "men" | "kids" | "home", HeroTileContent>;

// Backs the homepage's product-grid section — "source" is what lets the
// owner swap "New Arrivals" for "Trending"/"Best Sellers" from Site Content
// without any code change.
export interface HomeProductSectionContent {
  title: string;
  source: "new" | "trending" | "bestsellers";
  limit: number;
}

export interface MoodTileContent {
  id: string;
  label: string;
  image: string;
  href: string;
}

export type ShopByMoodContent = MoodTileContent[];

export interface FeaturedBrandAndSponsoredContent {
  featuredBrandSlug: string;
  sponsoredBrandSlugs: string[];
}

export interface JoinHeroContent {
  label: string;
  headingLines: string[];
  subheading: string;
  ctaLabel: string;
}

export interface ProductTaxonomyContent {
  categories: string[];
  typesByCategory: Record<string, string[]>;
  collections: string[];
  materials: string[];
  fits: string[];
}

// A single node in the recursive Main Category -> Product Group -> Product
// Type hierarchy (supabase/migrations/20260728000001_product_taxonomy_hierarchy.sql,
// table `taxonomy_nodes`). The full active tree is small (well under 200
// rows) and fetched flat in one query — components filter by `parentId`
// rather than the app resolving a nested tree server-side.
export type TaxonomyLevel = 1 | 2 | 3;

export interface TaxonomyNode {
  id: string;
  parentId: string | null;
  level: TaxonomyLevel;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ShippingSettingsContent {
  freeShippingThresholdEgp: number;
  returnPolicyDays: number;
}

export interface ContactInfoContent {
  supportEmail: string;
  supportPhone: string;
  address: string;
}

export interface AdminSearchResult {
  type: "product" | "brand" | "order" | "user";
  label: string;
  sublabel: string;
  href: string;
}

export interface FilterOption {
  id: string;
  label: string;
  count?: number;
}

export interface FilterGroup {
  id: string;
  title: string;
  options: FilterOption[];
}

// ── Product Variants (Color + Size combinations) ───────────────────────────
// Additive to the flat product-level sizes/colors/unavailableSizes/sku/
// inStock fields, not a replacement — a product with no variant rows keeps
// working off those flat fields exactly as before. `variants` stays
// optional everywhere it appears so every existing call site (which never
// supplies it) keeps type-checking unchanged.

export type ProductStatus =
  | "draft"
  | "pending_review"
  | "changes_requested"
  | "published"
  | "archived";
export type VariantAvailabilityStatus = "available" | "unavailable" | "discontinued";

export interface ProductVariant {
  id: string;
  productId: string;
  color?: string;
  size?: string;
  sku?: string;
  quantity: number;
  lowStockThreshold: number;
  priceOverride?: number;
  availabilityStatus: VariantAvailabilityStatus;
  createdAt: string;
  updatedAt: string;
}

// ── New product-level taxonomy/merchandising fields ─────────────────────────
// All optional/nullable in the DB, so every mapping function that doesn't
// set them yet (nothing does until Phase 2/3) keeps compiling unchanged.
export interface ProductTaxonomyFields {
  productCategory?: string;
  productType?: string;
  // The resolved Product Type leaf in the new hierarchical taxonomy
  // (taxonomy_nodes) — additive alongside productCategory/productType
  // above, which stay the read path for the rest of the app. Undefined for
  // any product not yet matched into the new tree (see the migration's
  // backfill note); the product form falls back to showing its existing
  // productCategory/productType as-is when this is unset.
  productTypeId?: string;
  collection?: string;
  material?: string;
  fit?: string;
  compareAtPrice?: number;
  modelHeight?: string;
  modelWearing?: string;
  trackInventory?: boolean;
  featured?: boolean;
  status?: ProductStatus;
  publishDate?: string;
}

export interface Product extends ProductTaxonomyFields {
  id: string;
  category: CategorySlug;
  brand: string;
  name: string;
  price: number;
  currency: "USD" | "EGP";
  rating: number;
  reviewCount: number;
  image: string;
  sizes: string[];
  colors: ProductColorOption[];
  inStock: boolean;
  variants?: ProductVariant[];
}

export type SortOption = "newest" | "price-asc" | "price-desc" | "top-rated";

export type ViewMode = "grid" | "list";

// ── Cart & Wishlist (moved here from context/CartContext.tsx and
// context/WishlistContext.tsx so all domain types live in one place) ──────

export interface CartLineItem {
  id: string; // unique line id (product id + size + color)
  productId: string;
  variantId?: string; // present once a product resolves to a real variant
  name: string;
  brand: string;
  price: number;
  currency: "USD" | "EGP";
  image: string;
  size: string;
  color?: string;
  quantity: number;
}

export interface WishlistItem {
  productId: string;
  name: string;
  brand: string;
  price: number;
  currency: "USD" | "EGP";
  image: string;
}


// ── Brand page types (LOCAL brand-page template) ────────────────────────────

export interface BrandInfoBadge {
  icon: "location" | "flag" | "truck" | "leaf";
  label: string;
}

export interface BrandValue {
  icon: "flag" | "package" | "leaf" | "pen";
  title: string;
  description: string;
}

export interface SimilarBrand {
  id: string;
  name: string;
  category: string;
  city: string;
  image: string;
}

export interface BrandCategoryTab {
  id: string;
  label: string;
}

export interface ProductReview {
  id: string;
  author: string;
  rating: number;
  date: string;
  comment: string;
}

export interface ProductColorOption {
  name: string;
  hex: string;
}

export interface ProductDetail extends ProductTaxonomyFields {
  id: string;
  name: string;
  brandName: string;
  brandSlug?: string;
  price: number;
  currency: "USD" | "EGP";
  images: string[];
  description: string;
  details: string[];
  careInstructions: string[];
  shippingReturns: string;
  sizes: string[];
  unavailableSizes: string[];
  colors: ProductColorOption[];
  rating: number;
  reviewCount: number;
  reviews: ProductReview[];
  sku: string;
  inStock: boolean;
  categorySlug?: CategorySlug;
  categoryLabel: string;
  categoryHref: string;
  relatedIds: string[];
  variants?: ProductVariant[];
}

// ── Admin (raw `products` row shape, used by the admin CRUD form/API) ──────

export interface ProductRecord extends ProductTaxonomyFields {
  id: string;
  name: string;
  brandName: string;
  brandSlug?: string;
  category?: CategorySlug;
  price: number;
  currency: "USD" | "EGP";
  image: string;
  images: string[];
  colors: ProductColorOption[];
  sizes: string[];
  unavailableSizes: string[];
  description: string;
  details: string[];
  careInstructions: string[];
  shippingReturns: string;
  sku: string;
  inStock: boolean;
  isNew: boolean;
  isUnisex: boolean;
  variants?: ProductVariant[];
  // ── Brand-portal review workflow (Round 3) ────────────────────────────
  // `pendingChanges` is a staged edit (same shape as the form submits,
  // including variants) for an already-published product — the fields
  // above stay the live truth until an admin approves it.
  pendingChanges?: Record<string, unknown> | null;
  reviewNotes?: string;
  submittedBy?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  deletionRequestedAt?: string;
  pausedByBrand: boolean;
}

// ── Admin (raw `brands` row shape, used by the admin CRUD form/API) ────────

export interface BrandRecord {
  slug: string;
  name: string;
  tagline: string;
  category: string;
  foundedYear?: number;
  city: string;
  heroImage: string;
  logoImage?: string;
  websiteUrl?: string;
  aboutDescription: string;
  aboutImage: string;
  storyImage: string;
  storyImage2?: string;
  storyBody: string;
  infoBadges: BrandInfoBadge[];
  categoryTabs: BrandCategoryTab[];
  activeTab: string;
  values: BrandValue[];
  similarBrandSlugs: string[];
  shopTheLook: BrandShopTheLookTile[];
  ownerUserId?: string;
  ownerEmail?: string;
}

// ── Orders (Supabase `orders` / `order_items` tables) ───────────────────────

export type OrderStatus = "pending" | "paid" | "shipped" | "fulfilled" | "cancelled";

export interface OrderItemRecord {
  id: string;
  productId: string | null;
  variantId?: string;
  name: string;
  brand: string;
  price: number;
  currency: "USD" | "EGP";
  size: string;
  color?: string;
  quantity: number;
  image: string;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  userId?: string;
  shippingName: string;
  shippingEmail: string;
  shippingPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingGovernorate: string;
  subtotalUsd: number;
  subtotalEgp: number;
  internalNotes?: string;
  couponCode?: string;
  discountAmountEgp: number;
  createdAt: string;
  items: OrderItemRecord[];
}

// ── Admin (raw `coupons` row shape) ─────────────────────────────────────────

export type CouponDiscountType = "percentage" | "fixed";

export interface CouponRecord {
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  maxUses?: number;
  usedCount: number;
  expiresAt?: string;
  active: boolean;
  createdAt: string;
}

// ── Brand applications ───────────────────────────────────────────────────
// Rebuilt 2026-07-25 (feature/brand-application-redesign) — see
// supabase/migrations/20260725000001_brand_application_workflow.sql for the
// full schema reasoning. `"new"`/`"reviewing"` are kept in the union only
// because pre-rebuild rows in some non-production snapshots may still carry
// them; the migration itself backfills every real row onto the new
// vocabulary, so new code should never write those two values.

export type ApplicationStatus =
  | "new"
  | "reviewing"
  | "draft"
  | "submitted"
  | "under_review"
  | "changes_requested"
  | "resubmitted"
  | "approved_pending_creation"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "converted_to_brand";

// Statuses where the applicant still has an active application — must match
// the partial unique index in the migration exactly.
export const ACTIVE_APPLICATION_STATUSES: ApplicationStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "changes_requested",
  "resubmitted",
  "approved_pending_creation",
];

export type ApplicantRole =
  | "founder"
  | "co_founder"
  | "manager"
  | "employee"
  | "agency_representative"
  | "other";

export type LegalStatus =
  | "both_docs"
  | "commercial_registration_only"
  | "tax_card_only"
  | "documents_pending"
  | "unregistered_individual"
  | "other";

export type BusinessSizeRange = "0_20" | "20_100" | "100_500" | "500_plus";

export type ManufacturingModel = "own_production" | "external_manufacturer" | "mixed";

export type FulfillmentModel = "ready_to_ship" | "made_to_order" | "both";

export type PreparationTimeRange =
  | "same_day"
  | "1_2_days"
  | "3_5_days"
  | "6_7_days"
  | "more_than_week";

export type ShippingCoverageOption = "all_egypt" | "selected_governorates" | "international";

export type ReturnsPolicy =
  | "returns_and_exchanges"
  | "exchanges_only"
  | "no_returns"
  | "depends_on_product";

// The 27 Egyptian governorates — canonical list backing both the brand-
// application City field and Step 4's "Selected governorates" shipping
// coverage. lib/join/constants.ts's EGYPT_GOVERNORATES runtime array is
// checked against this type (via `satisfies`) so the two can never drift.
export type EgyptGovernorate =
  | "Alexandria"
  | "Aswan"
  | "Asyut"
  | "Beheira"
  | "Beni Suef"
  | "Cairo"
  | "Dakahlia"
  | "Damietta"
  | "Faiyum"
  | "Gharbia"
  | "Giza"
  | "Ismailia"
  | "Kafr El Sheikh"
  | "Luxor"
  | "Matrouh"
  | "Minya"
  | "Monufia"
  | "New Valley"
  | "North Sinai"
  | "Port Said"
  | "Qalyubia"
  | "Qena"
  | "Red Sea"
  | "Sharqia"
  | "Sohag"
  | "South Sinai"
  | "Suez";

// Snapshot of the authenticated account at submission time — deliberately
// separate from the application's own contact fields (email/phone entered
// in the form). Never assume these identify the same thing; the admin UI
// shows both and flags when they differ, without treating that as fraud.
export interface ApplicantAccountSnapshot {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  accountCreatedAt: string;
}

export interface BrandApplicationDocumentRecord {
  id: string;
  applicationId: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  createdAt: string;
}

export interface BrandApplicationStatusHistoryEntry {
  id: string;
  applicationId: string;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  changedBy: string | null;
  reason: string | null;
  createdAt: string;
}

// ── Admin (raw `brand_applications` row shape) ──────────────────────────────
export interface BrandApplicationRecord {
  id: string;
  brandName: string;
  founderName: string;
  email: string;
  phone: string;
  instagramOrWebsite: string;
  productCategory: string;
  brandStory: string;
  salesChannels: string | null;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;

  applicantUserId: string | null;
  applicantRole: ApplicantRole | null;
  applicantRoleOther?: string;
  brandNameAr?: string;
  brandNameEn?: string;
  websiteUrl?: string;
  otherSocialUrls: string[];
  additionalCategories: string[];
  foundingYear?: number;
  country?: string;
  city?: EgyptGovernorate;
  salesChannelsList: string[];
  salesChannelLinks: Record<string, string>;
  approxProductCount?: number;
  approxMonthlyOrders?: string;
  approxProductCountRange?: BusinessSizeRange;
  approxMonthlyOrdersRange?: BusinessSizeRange;

  legalStatus: LegalStatus | null;
  commercialRegistrationNumber?: string;
  taxRegistrationNumber?: string;
  legalBusinessName?: string;

  productPriceRange?: string;
  productsManufacturedByBrand?: boolean;
  madeToOrder?: boolean;
  avgPreparationTime?: string;
  shippingCoverage?: string;
  returnExchangeAvailable?: boolean;
  inventoryStatus?: string;
  priceMin?: number;
  priceMax?: number;
  manufacturingModel?: ManufacturingModel;
  fulfillmentModel?: FulfillmentModel;
  avgPreparationTimeRange?: PreparationTimeRange;
  shippingCoverageOption?: ShippingCoverageOption;
  shippingGovernorates: EgyptGovernorate[];
  returnsPolicy?: ReturnsPolicy;
  inventoryModel: string[];

  consentAccurate: boolean;
  consentTerms: boolean;

  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  adminNotes?: string;
  changesRequestedMessage?: string;
  approvedBrandId?: string;
  reapplicationAllowedAt?: string;
  reapplicationOverride: boolean;
  convertedAt?: string;
  convertedBy?: string;
  applicantAccountSnapshot: ApplicantAccountSnapshot | null;
}

// ── Admin (raw `profiles` row shape, used by the users/permissions page) ───

export type StaffRole = "staff" | "manager" | "admin";
export type ProfileRole = "customer" | StaffRole | "brand_owner" | "brand_assistant";

export interface ProfileRecord {
  id: string;
  fullName?: string;
  email?: string;
  isAdmin: boolean;
  role: ProfileRole;
  createdAt: string;
}

// ── Admin (raw `notifications` row shape) ───────────────────────────────────

export type NotificationResolution = "pending" | "approved" | "reverted" | "n/a";

export interface NotificationRecord {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  // Instant-Publish (brand changes go live immediately, admin reviews
  // after) — only set on brand-initiated product notifications; every
  // other notification type stays at resolution "n/a" with no entity link.
  relatedEntityType?: "product";
  relatedEntityId?: string;
  auditLogId?: string;
  resolution: NotificationResolution;
}

// ── Admin (low-stock dashboard row — a variant joined to its product) ──────

export interface LowStockVariantRecord {
  variantId: string;
  productId: string;
  productName: string;
  brandName: string;
  image: string;
  color?: string;
  size?: string;
  quantity: number;
  lowStockThreshold: number;
}

// ── Admin (raw `audit_logs` row shape) ──────────────────────────────────────

export interface AuditLogRecord {
  id: string;
  actorId?: string;
  actorLabel: string;
  // Resolved from profiles.full_name at read time (Round 2 Phase 5) — falls
  // back to actorLabel (email) when unset, including for every historical
  // row logged before this existed.
  actorName?: string;
  entityType: string;
  entityId: string;
  action: string;
  beforeValue: unknown;
  afterValue: unknown;
  createdAt: string;
  // Denormalized at write time (Round 3) so a brand's own /brand-portal/logs
  // can filter to just its entries — never backfilled onto history, so
  // undefined here just means "logged before this column existed."
  brandSlug?: string;
}

export interface BrandPageContent {
  slug: string;
  name: string;
  tagline: string;
  category: string;
  foundedYear?: number;
  city: string;
  heroImage: string;
  logoImage?: string;
  websiteUrl?: string;
  aboutDescription: string;
  aboutImage: string;
  infoBadges: BrandInfoBadge[];
  categoryTabs: BrandCategoryTab[];
  activeTab: string;
  products: Product[];
  storyImage: string;
  storyImage2?: string;
  storyBody: string;
  values: BrandValue[];
  similarBrands: SimilarBrand[];
  // Round 4 — real, computed stats replacing decorative content.
  followerCount: number;
  storeRating: number;
  shopTheLook: BrandShopTheLookTile[];
}

export interface BrandShopTheLookTile {
  image: string;
  title: string;
  href: string;
}

// ── Account addresses (Supabase `addresses` table) ──────────────────────────
// Field names mirror checkout's ShippingForm 1:1 (firstName/lastName/phone/
// city/governorate) except `addressLine` (checkout's `address`) so a saved
// address can prefill checkout with zero remapping beyond that one field.

export interface NotificationPreferences {
  orderUpdates: boolean;
  promotions: boolean;
  newsletter: boolean;
  accountTheme?: AccountTheme;
}

export type AccountTheme = "warm_sand" | "soft_rose" | "olive_stone";

export type AddressLabel = "Home" | "Work" | "Other";

export interface AddressRecord {
  id: string;
  label: AddressLabel;
  firstName: string;
  lastName: string;
  phone: string;
  addressLine: string;
  city: string;
  governorate: string;
  buildingNumber?: string;
  floor?: string;
  apartment?: string;
  landmark?: string;
  deliveryInstructions?: string;
  postalCode?: string;
  isDefault: boolean;
}

// Shared shape for /privacy and /terms — the same section objects drive
// both the table-of-contents (id + title) and the rendered content, so the
// two can never drift out of sync. `body` is an array of blocks rather
// than one opaque string so paragraphs/lists/subsections can each get
// correct semantic markup instead of one unstructured blob.
export type LegalBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "subheading"; text: string };

export interface LegalSection {
  id: string;
  title: string;
  body: LegalBlock[];
}
