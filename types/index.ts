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
  // Up to 4 — same cap as a Collection's cover photos, rendered the same
  // way (CollectionCoverCarousel), auto-advancing when there's more than one.
  images: string[];
  // Admin hand-picked, resolved to live Product rows at render time
  // (lib/data/products.ts's getActiveProductsByIds) — never stored
  // denormalized here, so a product edited/unpublished elsewhere is
  // always reflected without touching this content.
  productIds: string[];
}

export type ShopByMoodContent = MoodTileContent[];

// The shape actually handed to components/ShopByMood.tsx — MoodTileContent
// plus each tile's productIds already resolved to real Product rows.
export type ResolvedMoodTile = MoodTileContent & { products: Product[] };

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
  // Flat delivery fee charged per shipment/order — waived once that
  // shipment's own EGP subtotal reaches freeShippingThresholdEgp. A
  // multi-shipment checkout (see brands.is_mahaly_partner splitting) is
  // charged this fee once per resulting shipment, not once per cart.
  flatDeliveryFeeEgp: number;
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

// ── Inventory & Variants ─────────────────────────────────────────────────────
// Variant-level inventory is the sole source of truth for every product —
// see lib/inventory/stockStatus.ts for the one shared Stock Status
// calculation used by every interface (product form, brand/admin
// inventory pages, cart/checkout).

export type ProductStatus =
  | "draft"
  | "pending_review"
  | "changes_requested"
  | "published"
  | "archived";

// Manually controlled ("Selling Status" — independent of the automatically
// calculated Stock Status below). active = normal; paused = temporarily
// unavailable even with stock; discontinued = never sold again, kept for
// history.
export type SellingStatus = "active" | "paused" | "discontinued";

// Automatically calculated, read-only — never stored, always derived from
// quantity + the effective low-stock threshold.
export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export type OptionSwatchType = "single" | "split" | "multicolor";

// A reusable option type (Color, Size — system, brandId undefined) or a
// brand's own private option type (e.g. "Length" — brandId set, visible
// and reusable only by that brand).
export interface OptionType {
  id: string;
  brandId?: string;
  name: string;
  key: string;
  isSystem: boolean;
  sortOrder: number;
}

export interface OptionValue {
  id: string;
  optionTypeId: string;
  brandId?: string;
  label: string;
  key: string;
  skuToken: string;
  sortOrder: number;
  swatchType?: OptionSwatchType;
  primaryColor?: string;
  secondaryColor?: string;
}

// One selected option value, denormalized onto a variant for display
// (option type name + the chosen value's label) — resolved server-side
// from product_variant_values / option_values, never stored redundantly.
export interface VariantOptionSelection {
  optionTypeId: string;
  optionTypeName: string;
  optionValueId: string;
  label: string;
  // The selected value's own option_values.sort_order and brand_id — used
  // together to place a custom (brand-defined) Size correctly relative to
  // shared/system sizes and other custom sizes (see
  // lib/inventory/sizeOrder.ts). Meaningless for other option types, but
  // always carried through since both are free from the same row.
  sortOrder?: number;
  brandId?: string | null;
  // Only present when optionTypeName is "Color" — carried here so the
  // storefront/admin never need a second lookup just to render a swatch
  // next to a variant's selected color.
  swatchType?: OptionSwatchType;
  primaryColor?: string;
  secondaryColor?: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  quantity: number;
  // Nullable — null means "use products.defaultLowStockThreshold".
  lowStockThresholdOverride?: number;
  // The final selling price for this variant — null means "use the
  // product's own base Price" (see effectiveVariantPrice in
  // lib/inventory/pricing.ts). Not a delta/adjustment.
  variantPrice?: number;
  // Mutually exclusive with the product's own discountPercent — a variant
  // can be discounted individually (e.g. one color on sale) or the whole
  // product can be, never both at once. See getEffectivePrice/lib/pricing.ts.
  variantDiscountPercent?: number;
  sellingStatus: SellingStatus;
  isArchived: boolean;
  optionValues: VariantOptionSelection[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductColorImage {
  optionValueId: string;
  imageUrl: string;
}

// Reusable readiness signal for the later Publishing & Visibility phase —
// resolved server-side from a product's live variant set.
export interface ProductVariantReadiness {
  hasAtLeastOneVariant: boolean;
  hasActivePurchasableVariant: boolean;
  hasValidInventory: boolean;
  hasValidVariantCombinations: boolean;
}

// The Basic Information "Audience" field — the sole source of truth for
// who a product is for. Required on every product (DB: NOT NULL + CHECK,
// no null/"None" option, no automatic "Unisex" fallback). The old Gender
// pair (`products.category` 'women'|'men'|'kids' + `is_unisex` boolean)
// has been removed from the schema entirely — /shop/women|men|kids
// routing now derives its audience filter from this column via
// lib/audience.ts instead of reading a stored category.
export type Audience = "men" | "women" | "unisex" | "kids_baby";

// One entry in a product's multi-material composition — percentages
// across all entries must total exactly 100 before publishing (Draft may
// stay incomplete). Stored as `products.materials` jsonb.
export interface ProductMaterialEntry {
  material: string;
  percentage: number;
}

// ── Product-level taxonomy/merchandising fields ─────────────────────────────
export interface ProductTaxonomyFields {
  // The resolved Product Type leaf (Level 3) in the hierarchical taxonomy
  // (taxonomy_nodes) — the only classification a product stores; the full
  // Main Category / Product Group / Product Type path is resolved via
  // parent relationships, never stored redundantly on the product itself.
  productTypeId: string;
  // Display-only, resolved from productTypeId — never stored, never sent
  // as input.
  mainCategory: string;
  productGroup: string;
  productTypeName: string;
  audience: Audience;
  // The brand-owned collection this product belongs to (collections
  // table), scoped to the product's own brand — optional, a product need
  // not belong to a collection.
  collectionId?: string;
  collectionName?: string;
  // Legacy single-material field — preserved for backward compatibility,
  // no longer written by the editor. `materials` (below) is the
  // structured, multi-material composition that replaced it.
  material?: string;
  materials?: ProductMaterialEntry[];
  fit?: string;
  // A discount is a percentage plus an optional end time — undefined
  // discountEndsAt means it runs forever until discountPercent is cleared.
  // The actual charged/displayed price is always derived from these via
  // lib/pricing.ts's getEffectivePrice(), never stored separately.
  discountPercent?: number;
  discountEndsAt?: string;
  modelHeight?: string;
  modelWearing?: string;
  featured?: boolean;
  status?: ProductStatus;
  publishDate?: string;
  // Stamped the moment a product first becomes a draft, cleared the moment
  // it leaves draft (lib/admin/productPersistence.ts) — drives the 10-day
  // auto-expiry countdown (lib/admin/expireDrafts.ts). undefined for a
  // product that's never been a draft, or predates this feature.
  draftStartedAt?: string;
  defaultLowStockThreshold?: number;
  // Computed fresh on every read from status + publishDate (see
  // lib/newArrivals.ts) — never a stored/editable flag.
  isNew?: boolean;
}

export interface Product extends ProductTaxonomyFields {
  id: string;
  category: CategorySlug;
  brand: string;
  brandSlug?: string;
  name: string;
  price: number;
  currency: "USD" | "EGP";
  rating: number;
  reviewCount: number;
  image: string;
  // Derived from the live variant set (never stored) — every distinct
  // size/color offered by an in-stock, purchasable variant.
  sizes: string[];
  colors: ProductColorOption[];
  // True when at least one variant is purchasable (active + quantity > 0).
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
  // Relational key back to the brand, needed to group the cart by brand and
  // to preview the partner/independent shipment split before checkout. Falls
  // back to "" for any pre-this-feature cart line still in a shopper's
  // localStorage (rehydrated once they touch the cart again, since add/remove
  // always rewrites the whole array).
  brandSlug: string;
  price: number;
  currency: "USD" | "EGP";
  image: string;
  size: string;
  color?: string;
  quantity: number;
  // Snapshotted from the product at add-time so the cart can offer a size/
  // color switcher without an extra fetch — never re-validated until
  // checkout, which always re-resolves the real variant server-side anyway.
  availableSizes?: string[];
  availableColors?: string[];
}

// Identifies exactly one purchased line from a payment attempt's own
// cart_snapshot (see lib/payments/reconcilePendingCardPayment.ts and
// context/CartContext.tsx's removePurchasedItems) — used only to remove
// exactly those quantities from the current cart, never to clear it
// wholesale. Keyed the same way CartLineItem itself is (productId+size+
// color), not by variantId — a line's variant can drift between add-to-
// cart time and purchase time (see lib/cart/liveValidation.ts), but what
// was actually paid for should match what the cart already keys lines on.
export interface PurchasedCartLine {
  productId: string;
  size: string;
  color: string;
  quantity: number;
}

export interface WishlistItem {
  productId: string;
  name: string;
  brand: string;
  brandSlug?: string;
  price: number;
  currency: "USD" | "EGP";
  image: string;
}


// ── Brand page types (LOCAL brand-page template) ────────────────────────────

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
  swatchType?: OptionSwatchType;
  secondaryColor?: string;
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
  // The /shop/women|men|kids section this product's audience maps to —
  // derived from `audience` (lib/audience.ts), never stored. The taxonomy
  // breadcrumb text itself (Main Category / Product Group / Product Type)
  // comes from ProductTaxonomyFields' mainCategory/productGroup/productTypeName.
  categorySlug: CategorySlug;
  categoryHref: string;
  relatedIds: string[];
  variants?: ProductVariant[];
  // Color label -> mapped image URL (product_color_images), used to swap
  // the gallery's primary image on an explicit color selection.
  colorImages?: Record<string, string>;
}

// ── Admin (raw `products` row shape, used by the admin CRUD form/API) ──────

export interface ProductRecord extends ProductTaxonomyFields {
  id: string;
  name: string;
  brandName: string;
  brandSlug: string;
  // The real ownership FK — immutable after creation. brandSlug/brandName
  // above stay in sync with it automatically (a DB trigger derives them),
  // and are used only for display/linking.
  brandId: string;
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
  variants?: ProductVariant[];
  colorImages?: Record<string, string>;
  // Reusable signal for the later Publishing & Visibility phase.
  variantReadiness?: ProductVariantReadiness;
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
  // The real relational key — ownership/authorization/FK integrity for
  // products, collections, and brand_staff all point at this, never at
  // slug. Read-only; assigned once by the DB on creation.
  id: string;
  slug: string;
  name: string;
  category: string;
  additionalCategories: string[];
  isActive: boolean;
  // Mahaly-partner brands keep stock in Mahaly's own warehouse — their
  // orders pool with every other partner brand's into one shared shipment/
  // delivery fee at checkout, instead of each becoming its own shipment.
  isMahalyPartner: boolean;
  // Sponsorship — admin-only. `sponsoredPlacements` can hold more than one
  // placement at once; `sponsoredOrder` breaks ties when several brands
  // share the same placement (lower shows first / earlier in a carousel).
  // See lib/admin/brandValidation.ts's SPONSOR_PLACEMENTS for the fixed set.
  isSponsored: boolean;
  sponsoredPlacements: string[];
  sponsoredOrder?: number;
  // Admin-managed, required before this brand can create a product through
  // the server-generated SKU path (next_product_sku RPC). Read-only for
  // brand owners, and locked (DB trigger) once the brand has any product.
  skuPrefix: string;
  // True once this brand has >=1 product — drives the BrandForm's SKU
  // Prefix field lock in the UI (the DB trigger is the real enforcement;
  // this is read-only display context, never trusted for authorization).
  hasProducts?: boolean;
  foundedYear?: number;
  city: string;
  // Read-only here — the admin brands list thumbnail is the only remaining
  // consumer; both are edited via InlineEditableImage on the live brand
  // page now, not this form.
  heroImage: string;
  logoImage?: string;
  aboutDescription: string;
  aboutImage: string;
  storyBody: string;
  ownerUserId?: string;
  ownerEmail?: string;
  // Shipping & Returns policy priority: this Brand's fields, falling back
  // to the marketplace default (7 days) — see lib/admin/shippingPolicy.ts.
  shippingPolicy?: string;
  returnPolicy?: string;
  returnWindowDays?: number;
}

// ── Collections (Supabase `collections` table) — brand-owned, replaces the
// old global free-text product.collection value. ───────────────────────────
export interface CollectionRecord {
  id: string;
  brandId: string;
  name: string;
  slug: string;
  description?: string;
  coverImageUrl?: string;
  // One or more cover photos, shown as an auto-advancing slideshow when
  // there's more than one (see components/brand/CollectionCoverCarousel).
  coverImageUrls: string[];
  // Short editable badge on the collection card — owner-authored, not
  // auto-derived (unlike the old "N pieces" / month-year labels).
  tagline?: string;
  isActive: boolean;
  publishedAt?: string;
  // Optional scheduled reveal — set and fully configure a collection
  // before it's actually shown to shoppers.
  visibleFrom?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  // Display order the owner chose via drag-to-reorder on the brand
  // profile's Collections page (components/brand/CollectionsOrderPanel) —
  // position 0 is treated as the "featured" collection everywhere the
  // public experience distinguishes one, no separate flag needed.
  sortOrder: number;
}

// ── Orders (Supabase `orders` / `order_items` tables) ───────────────────────

export type OrderStatus = "pending" | "paid" | "preparing" | "shipped" | "fulfilled" | "cancelled";

export type OrderFulfillmentType = "mahaly_pool" | "brand_direct";

// Point-in-time pricing snapshot fields (added by
// supabase/migrations/20260813000002_order_pricing_snapshots.sql). All
// optional/nullable — historical order_items rows placed before this
// migration have none of them, and must never have these values derived
// from a product's current price. Older rows simply render `price` alone,
// with no strikethrough.
export type OrderItemDiscountSource = "product_discount" | "variant_discount" | "none";

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
  originalUnitPrice?: number | null;
  discountPercentSnapshot?: number | null;
  discountSource?: OrderItemDiscountSource | null;
  itemCouponDiscountEgp?: number;
}

export interface OrderStatusHistoryEntry {
  id: string;
  status: OrderStatus;
  note?: string;
  createdAt: string;
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
  // Multi-brand/partner-fulfillment splitting — see
  // supabase/migrations/20260807000001_brand_partner_fulfillment_and_order_splitting.sql
  // and, for the real master_orders parent row, supabase/migrations/
  // 20260812000006_master_orders.sql. masterOrderId/masterOrderNumber tie
  // every shipment created from one checkout together (masterOrderNumber
  // is the ZK-XXXXXX customer-facing purchase reference); fulfillmentType/
  // brandSlug/shippingFeeEgp describe this shipment alone.
  masterOrderId: string;
  masterOrderNumber: string;
  fulfillmentType: OrderFulfillmentType;
  brandSlug?: string;
  shippingFeeEgp: number;
  statusHistory?: OrderStatusHistoryEntry[];
  // Present on every order (COD included — paymentMethod is always
  // 'cash_on_delivery' there), but paymentAttemptId is only ever set for
  // a card order (see supabase/migrations/
  // 20260812000001_paymob_webhook_and_paid_fulfillment.sql's
  // place_paid_order) — this is the only evidence in the admin UI that an
  // order was actually paid by card through Paymob rather than COD.
  paymentMethod: "cash_on_delivery" | "card";
  paymentStatus: "unpaid" | "paid" | "refunded";
  paymentAttemptId?: string;
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

// Whether the applicant will handle their own packaging/fulfillment, or
// wants Mahaly to handle packaging, shipping, and storage on their behalf
// while they focus on their brand page and product listings — the single
// most important operational question on the application, replacing the
// old manufacturing/fulfillment-model fields.
export type FulfillmentResponsibility = "brand_handles" | "mahaly_handles";

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
  documentType?: ApplicationDocumentType;
  uploadStatus?: "uploading" | "uploaded" | "failed" | "replaced" | "removed";
}

export type ApplicationDocumentType =
  | "commercial_registration"
  | "tax_card"
  | "trademark_certificate"
  | "authorized_representative"
  | "other_supporting_document";

export interface BrandApplicationData {
  fullName?: string;
  businessEmail?: string;
  phone?: string;
  applicantRole?: string;
  applicantRoleOther?: string;
  preferredContactMethod?: "email" | "phone" | "whatsapp";
  brandName?: string;
  brandNameAr?: string;
  primaryCategory?: string;
  targetAudiences?: string[];
  country?: string;
  city?: string;
  foundedYear?: number;
  shortDescription?: string;
  fullBrandStory?: string;
  brandDifference?: string;
  salesChannels?: string[];
  socialLinks?: Record<string, { handle?: string; url?: string; marketplaceName?: string }>;
  productCountRange?: string;
  monthlyOrdersRange?: string;
  teamSizeRange?: string;
  monthlySalesRange?: string;
  businessType?: string;
  legalBusinessName?: string;
  commercialRegistrationNumber?: string;
  taxRegistrationNumber?: string;
  registrationCountry?: string;
  operatingName?: string;
  registrationExpectedDate?: string;
  productCategories?: string[];
  typicalMinimumPrice?: number;
  typicalMaximumPrice?: number;
  variantReadiness?: string;
  manufacturingModel?: string;
  manufacturingCountry?: string;
  productionLeadTime?: string;
  inventoryModels?: string[];
  inventoryStorage?: string;
  orderPreparation?: string;
  courierPickup?: string;
  preparationTime?: string;
  shippingCoverage?: string[];
  shippingProvider?: string;
  returnsAccepted?: boolean;
  exchangesAccepted?: boolean;
  returnWindow?: string;
  nonReturnableCategories?: string;
  agreementAccurate?: boolean;
  agreementAuthorized?: boolean;
  agreementReview?: boolean;
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
  legalStatusOther?: string;

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
  returnsPolicyDetails?: string;
  inventoryModel: string[];
  fulfillmentResponsibility?: FulfillmentResponsibility;

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
  referenceNumber?: string;
  schemaVersion?: number;
  preferredContactMethod?: "email" | "phone" | "whatsapp";
  applicationData?: BrandApplicationData;
  currentStep?: number;
  lastSavedAt?: string;
  lockVersion?: number;
  submittedAt?: string;
  requestedSections?: string[];
  requestedFields?: string[];
  applicantVisibleMessage?: string;
  informationResponseDeadline?: string;
  lastResubmittedAt?: string;
  convertedBrandId?: string;
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

// ── Admin (custom roles/permissions — Discord-style access control) ────────

export interface PermissionRecord {
  key: string;
  label: string;
  description: string;
  category: string;
}

export interface RoleRecord {
  id: string;
  name: string;
  description: string;
  color: string | null;
  isProtected: boolean;
  rank: number;
  permissionKeys: string[];
  memberCount: number;
  createdAt: string;
}

export interface RoleMemberRecord {
  userId: string;
  fullName: string | null;
  email: string | null;
  assignedAt: string;
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
  // Any AuditEntityType string (lib/auditLog.ts) — used to build a "go to
  // this thing" link (lib/admin/entityLinks.ts). Only Instant-Publish
  // brand-initiated product notifications also carry `resolution:
  // "pending"` and get Approve/Revert controls; every other notification
  // type can still set this pair purely for the click-through link.
  relatedEntityType?: string;
  relatedEntityId?: string;
  auditLogId?: string;
  resolution: NotificationResolution;
}

// ── Customer (raw `user_notifications` row shape) ───────────────────────────

export interface UserNotificationRecord {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
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
  sellingStatus: SellingStatus;
  stockStatus: StockStatus;
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
  id: string;
  slug: string;
  name: string;
  // No longer editable anywhere (removed from both the old brand-portal
  // form and the inline-edit system) but still real, live data —
  // components/navigation/BrandsMegaMenu.tsx and components/Sponsored.tsx
  // both read it as the fallback description when aboutDescription is
  // empty.
  tagline: string;
  category: string;
  additionalCategories: string[];
  foundedYear?: number;
  city: string;
  // The brand's own row creation date — real data, safe to show as "brand
  // joined Mahaly" without inventing a date.
  createdAt: string;
  heroImage: string;
  logoImage?: string;
  aboutDescription: string;
  aboutImage: string;
  products: Product[];
  storyBody: string;
  // Round 4 — real, computed stats replacing decorative content.
  followerCount: number;
  storeRating: number;
  // Active/published collections this brand has — the "Collections" stat
  // on BrandProfileHeader (replaces the old shop_the_look.length, which
  // never reflected anything real).
  collectionsCount: number;
  isMahalyPartner: boolean;
  // Optional, owner/admin-entered via the same inline-edit pencil as
  // tagline/aboutDescription — never auto-filled or guessed. A list (not
  // a single field) since a brand can credit more than one founder, each
  // with their own name and title, in whatever order the owner picks.
  founders: BrandFounder[];
  // Custom milestones an owner/admin adds on top of the always-real
  // computed ones (foundedYear, createdAt) shown on the About page.
  journeyMilestones: BrandJourneyMilestone[];
  // The one most-recently-deleted image URL per field, if any — backs the
  // "undo" button in InlineEditableImage (see app/api/brands/[slug]/image
  // and its restore/ sibling). Only ever the single latest deletion, never
  // a history.
  deletedImageBackups: Partial<Record<BrandImageField, string>>;
  // Owner/admin-editable, defaults to the page's original fixed copy when
  // unset (see app/brands/[slug]/about/page.tsx).
  aboutHeadline?: string;
  aboutQuote?: string;
  // Whether this brand was created from a brand_applications row (has a
  // source_application_id) — gates the About page's "Import from your
  // application" button; the application's own story text is fetched
  // separately (GET /api/brands/[slug]/application-story) only when an
  // owner/admin actually clicks it, never eagerly.
  hasSourceApplication: boolean;
  // The Collections page's own editable headline ("Collections,
  // reimagined."), same fallback-when-empty pattern as the rest.
  collectionsPageTitle?: string;
  // The expanded-collection chrome text ("The edit" / "Pieces from
  // {name}") — see components/brand/BrandCollectionsExperience.
  collectionsDetailEyebrow?: string;
  collectionsDetailHeading?: string;
}

export interface BrandFounder {
  name: string;
  // e.g. "Founder", "Co-Founder", "Creative Director" — free text, not a
  // fixed enum, since brands describe this differently.
  title: string;
}

// Kept as a plain string union (rather than importing the runtime array) so
// this file never needs to import from lib/ — see BRAND_IMAGE_FIELDS in
// lib/brandImageFields.ts, cross-checked against this type via `satisfies`,
// same convention as EgyptGovernorate/EGYPT_GOVERNORATES.
export type BrandImageField = "hero" | "logo" | "about";

// Kept as a plain string union (rather than importing the runtime array) so
// this file never needs to import from lib/ — see JOURNEY_ICON_KEYS in
// lib/brandJourneyIcons.ts, cross-checked against this type via `satisfies`,
// same convention as EgyptGovernorate/EGYPT_GOVERNORATES.
export type JourneyIconKey =
  | "sparkles"
  | "store"
  | "heart"
  | "award"
  | "rocket"
  | "package"
  | "star"
  | "trophy"
  | "palette"
  | "users"
  | "map-pin"
  | "shopping-bag";

export interface BrandJourneyMilestone {
  year: string;
  // Optional — a milestone can be dated to just a year. When set, both
  // this and year decide the timeline's chronological sort order.
  month?: number;
  title: string;
  description: string;
  icon: JourneyIconKey;
}

// ── Account addresses (Supabase `addresses` table) ──────────────────────────
// Field names mirror checkout's ShippingForm 1:1 (firstName/lastName/phone/
// city/governorate) except `addressLine` (checkout's `address`) so a saved
// address can prefill checkout with zero remapping beyond that one field.

export interface NotificationPreferences {
  orderUpdates: boolean;
  promotions: boolean;
  newsletter: boolean;
}

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

// ── Normalized user-facing error contract ────────────────────────────────
// Every API response and Supabase-auth-facing call site should describe a
// failure using this shape (built via lib/errors/*) instead of a bare
// string — one consistent contract for every error surface (field error,
// form summary, inline banner, toast) instead of each page inventing its
// own. `userMessage` is always safe to render as-is; raw technical detail
// (Postgres/Supabase error text, stack traces) never belongs in this type
// and must go through logError()/safeErrorResponse() instead.
export type ErrorCategory =
  | "validation"
  | "authentication"
  | "authorization"
  | "conflict"
  | "not_found"
  | "rate_limit"
  | "network"
  | "timeout"
  | "file_upload"
  | "storage"
  | "database_constraint"
  | "server_unavailable"
  | "external_provider"
  | "unknown";

export interface AppError {
  category: ErrorCategory;
  userMessage: string;
  // Present only for validation errors with per-field detail — keyed by
  // field name, same convention ApplyBrandForm's Zod-issue mapping already
  // used, generalized so every form can share one shape.
  fieldErrors?: Record<string, string>;
  retryable: boolean;
  suggestedAction?: string;
  // Only set for the "unknown" category, where the real cause can't be
  // safely described to the user — lets support trace it back through
  // logError()'s Discord mirror without exposing anything in the UI itself.
  correlationId?: string;
}
