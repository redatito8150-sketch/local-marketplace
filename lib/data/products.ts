import { supabase } from "@/lib/supabase/client";
import { logError } from "@/lib/errorLog";
import { getVariantsForProducts } from "@/lib/data/variants";
import { getFullTaxonomyTree, resolveTaxonomyPath } from "@/lib/data/taxonomy";
import { shopCategoryAudiences, primaryShopCategoryForAudience } from "@/lib/audience";
import { isVariantPurchasable } from "@/lib/inventory/stockStatus";
import { resolveShippingPolicy } from "@/lib/admin/shippingPolicy";
import { NEW_ARRIVAL_WINDOW_DAYS, isWithinNewArrivalWindow, isPublishDateLive, publishDateLiveFilter } from "@/lib/newArrivals";
import { sortSizeOrderables } from "@/lib/inventory/sizeOrder";
import {
  Audience,
  CategorySlug,
  Product,
  ProductDetail,
  ProductReview,
  ProductColorOption,
  ProductStatus,
  ProductVariant,
  TaxonomyNode,
} from "@/types";
import { parsePriceRangeValue } from "@/lib/filters";

// Fills in the display fields that are computed from a product's live,
// non-archived variant set rather than stored on the product row itself
// (products.sizes/colors/unavailable_sizes/in_stock were removed —
// variant-level data is the only source of truth for all of this). Every
// call site that attaches variants to a card/detail object must go
// through this, not just set `variants` directly.
export function attachVariantDerivedFields<T extends { sizes: string[]; colors: ProductColorOption[]; inStock: boolean; variants?: ProductVariant[] }>(
  product: T,
  variants: ProductVariant[]
): T {
  // A custom (brand-owned) Size's position among other custom sizes comes
  // from its own option_values.sort_order + brand_id (see
  // lib/inventory/sizeOrder.ts) — first occurrence across variants wins,
  // same as the label dedup below.
  const sizeMetaByLabel = new Map<string, { sortOrder?: number; brandId?: string | null }>();
  for (const v of variants) {
    for (const o of v.optionValues) {
      if (o.optionTypeName === "Size" && !sizeMetaByLabel.has(o.label)) {
        sizeMetaByLabel.set(o.label, { sortOrder: o.sortOrder, brandId: o.brandId });
      }
    }
  }
  const sizeLabels = sortSizeOrderables(
    [...sizeMetaByLabel.entries()].map(([label, meta]) => ({ id: label, label, ...meta }))
  ).map((entry) => entry.label);
  const colorMap = new Map<string, ProductColorOption>();
  for (const variant of variants) {
    for (const option of variant.optionValues) {
      if (option.optionTypeName === "Color" && !colorMap.has(option.optionValueId)) {
        colorMap.set(option.optionValueId, { name: option.label, hex: option.primaryColor ?? "#D9D2C8", swatchType: option.swatchType, secondaryColor: option.secondaryColor });
      }
    }
  }
  const inStock = variants.some((v) =>
    isVariantPurchasable({ sellingStatus: v.sellingStatus, quantity: v.quantity, isArchived: v.isArchived })
  );

  return { ...product, sizes: sizeLabels, colors: [...colorMap.values()], inStock, variants };
}

export interface ProductRow {
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
  rating: number;
  review_count: number;
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
  // Immutable — the first moment this product actually became visible to a
  // real customer. Drives the "New" window (lib/newArrivals.ts) instead of
  // publish_date, which can be hidden behind a when_stocked launch policy.
  first_visible_at: string | null;
  // Set once, the first time any variant genuinely gets positive stock
  // (direct Inventory add or an accepted warehouse receipt) — never
  // cleared afterward. Drives the Coming Soon vs. Sold Out distinction on
  // product cards (lib/brandProfile.ts's productCardBadge): a product that
  // has NEVER been stocked yet is Coming Soon, not Sold Out.
  first_stocked_at: string | null;
}

// Keep public catalog reads aligned with the database's column grants. New
// workflow/moderation columns must be added deliberately instead of leaking
// automatically through select("*") when the schema evolves.
export const PRODUCT_PUBLIC_SELECT =
  "id, name, brand_name, brand_slug, brand_id, product_type_id, audience, collection_id, material, materials, fit, price, discount_percent, discount_ends_at, currency, image, images, rating, review_count, description, details, care_instructions, shipping_returns, model_height, model_wearing, sku, is_new, featured, status, publish_date, default_low_stock_threshold, created_at, first_visible_at, first_stocked_at" as const;

// Per-request lookup context for the display-only fields resolved from
// product_type_id/collection_id — loaded once and reused across a batch
// of rows instead of re-querying per product. Exported so other data-layer
// modules that map ProductRow -> Product (lib/data/brands.ts,
// lib/data/collections.ts) can build the same context instead of
// duplicating this logic.
export interface DisplayContext {
  taxonomyTree: TaxonomyNode[];
  collectionNamesById: Map<string, string>;
}

export async function loadDisplayContext(rows: ProductRow[]): Promise<DisplayContext> {
  const collectionIds = [...new Set(rows.map((r) => r.collection_id).filter((v): v is string => Boolean(v)))];
  const [taxonomyTree, collectionNamesById] = await Promise.all([
    getFullTaxonomyTree(),
    loadCollectionNames(collectionIds),
  ]);
  return { taxonomyTree, collectionNamesById };
}

async function loadCollectionNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("collections").select("id, name").in("id", ids);
  if (error) throw new Error(`loadCollectionNames failed: ${error.message}`);
  return new Map((data ?? []).map((row) => [row.id as string, row.name as string]));
}

const REVIEW_AUTHORS = ["Mona K.", "Youssef A.", "Salma R.", "Karim T.", "Nadine H."];

function generateReviews(count: number, rating: number): ProductReview[] {
  const comments = [
    "Beautiful quality, fits exactly as expected. Would buy again.",
    "Fabric feels premium and the fit is true to size.",
    "Really happy with this — great attention to detail.",
    "Good product overall, delivery was quick too.",
    "Exceeded my expectations, the craftsmanship really shows.",
  ];
  return Array.from({ length: Math.min(count, 5) }).map((_, i) => ({
    id: `r-${i + 1}`,
    author: REVIEW_AUTHORS[i % REVIEW_AUTHORS.length],
    rating: Math.max(3, Math.round(rating) - (i % 2)),
    date: `2026-0${(i % 6) + 1}-1${i}`,
    comment: comments[i % comments.length],
  }));
}

export function toProductCard(row: ProductRow, ctx: DisplayContext): Product {
  const path = resolveTaxonomyPath(ctx.taxonomyTree, row.product_type_id);
  return {
    id: row.id,
    category: primaryShopCategoryForAudience(row.audience),
    brand: row.brand_name,
    brandSlug: row.brand_slug ?? undefined,
    name: row.name,
    price: Number(row.price),
    currency: row.currency,
    rating: Math.round(row.rating),
    reviewCount: row.review_count,
    image: row.image,
    // Filled in by attachVariantDerivedFields once this product's variants
    // are loaded (see every caller of toProductCard below).
    sizes: [],
    colors: [],
    inStock: false,
    productTypeId: row.product_type_id,
    mainCategory: path?.mainCategory ?? "",
    productGroup: path?.productGroup ?? "",
    productTypeName: path?.productTypeName ?? "",
    audience: row.audience,
    collectionId: row.collection_id ?? undefined,
    collectionName: row.collection_id ? ctx.collectionNamesById.get(row.collection_id) : undefined,
    material: row.material ?? undefined,
    fit: row.fit ?? undefined,
    discountPercent: row.discount_percent ?? undefined,
    discountEndsAt: row.discount_ends_at ?? undefined,
    featured: row.featured,
    isNew: isWithinNewArrivalWindow(row.status, row.first_visible_at),
    firstStockedAt: row.first_stocked_at ?? undefined,
  };
}

function toProductDetail(row: ProductRow, ctx: DisplayContext): ProductDetail {
  const path = resolveTaxonomyPath(ctx.taxonomyTree, row.product_type_id);
  const categorySlug = primaryShopCategoryForAudience(row.audience);

  return {
    id: row.id,
    name: row.name,
    brandName: row.brand_name,
    brandSlug: row.brand_slug ?? undefined,
    price: Number(row.price),
    discountPercent: row.discount_percent ?? undefined,
    discountEndsAt: row.discount_ends_at ?? undefined,
    currency: row.currency,
    images: row.images?.length ? row.images : [row.image],
    description: row.description,
    details: row.details ?? [],
    careInstructions: row.care_instructions ?? [],
    shippingReturns: row.shipping_returns,
    // Filled in by attachVariantDerivedFields/getProductById once this
    // product's variants are loaded.
    sizes: [],
    unavailableSizes: [],
    colors: [],
    rating: Number(row.rating),
    reviewCount: row.review_count,
    reviews: generateReviews(row.review_count, row.rating),
    sku: row.sku,
    inStock: false,
    categorySlug,
    categoryHref: `/shop/${categorySlug}`,
    relatedIds: [], // filled in by getProductById after a second query
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
    modelHeight: row.model_height ?? undefined,
    modelWearing: row.model_wearing ?? undefined,
    featured: row.featured,
    isNew: isWithinNewArrivalWindow(row.status, row.first_visible_at),
    status: row.status,
    publishDate: row.publish_date ?? undefined,
    defaultLowStockThreshold: row.default_low_stock_threshold,
  };
}

export async function getProductsByCategory(
  category: CategorySlug
): Promise<Product[]> {
  const { data, error } = await supabase
    .from("storefront_products")
    .select(PRODUCT_PUBLIC_SELECT)
    .in("audience", shopCategoryAudiences(category))
    .eq("status", "published")
    .or(publishDateLiveFilter())
    .order("created_at", { ascending: true });

  if (error) throw new Error(`getProductsByCategory(${category}) failed: ${error.message}`);

  const rows = (data as ProductRow[]) ?? [];
  const ctx = await loadDisplayContext(rows);
  const cards = rows.map((row) => toProductCard(row, ctx));
  const variantsByProduct = await getVariantsForProducts(cards.map((c) => c.id));
  return cards.map((c) => attachVariantDerivedFields(c, variantsByProduct.get(c.id) ?? []));
}

export async function getProductCountLabel(
  category: CategorySlug
): Promise<number> {
  const { count, error } = await supabase
    .from("storefront_products")
    .select("id", { count: "exact", head: true })
    .in("audience", shopCategoryAudiences(category))
    .eq("status", "published")
    .or(publishDateLiveFilter());

  if (error) {
    throw new Error(`getProductCountLabel(${category}) failed: ${error.message}`);
  }
  // Storefront copy shows a rounded "catalog size" rather than the literal
  // seeded row count — keeps the existing look while the catalog is small.
  const safeCount = count ?? 0;
  return category === "women" ? Math.max(safeCount, 342) : safeCount * 40;
}

export async function getNewArrivals(limit: number = 24): Promise<Product[]> {
  // A product is New for exactly NEW_ARRIVAL_WINDOW_DAYS after it actually
  // became visible to a real customer (first_visible_at), not a stored
  // is_new flag and not publish_date — a when_stocked product's hidden
  // publish time never starts this clock. See lib/newArrivals.ts. No upper
  // bound needed (unlike the old publish_date-based query): first_visible_at
  // is only ever stamped to now(), never a future/scheduled value.
  const now = new Date();
  const windowStart = new Date(now.getTime() - NEW_ARRIVAL_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("storefront_products")
    .select(PRODUCT_PUBLIC_SELECT)
    .eq("status", "published")
    .not("first_visible_at", "is", null)
    .gte("first_visible_at", windowStart)
    .order("first_visible_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getNewArrivals failed: ${error.message}`);
  }

  const rows = ((data as ProductRow[]) ?? []);
  const ctx = await loadDisplayContext(rows);
  const cards = rows.map((row) => toProductCard(row, ctx));
  const variantsByProduct = await getVariantsForProducts(cards.map((c) => c.id));
  return cards.map((c) => attachVariantDerivedFields(c, variantsByProduct.get(c.id) ?? []));
}

export async function getAllActiveProducts(
  limit: number = 12,
  sorting: "newest" | "price-asc" | "price-desc" | "top-rated" = "newest",
  featuredOnly = false
): Promise<Product[]> {
  const safeLimit = Math.max(1, Math.min(limit, 24));
  // in_stock no longer exists as a stored column — over-fetch a candidate
  // set (published/not paused, same ordering) and filter down to
  // purchasable-in-stock products in memory once variants are attached,
  // since "in stock" can only be known from the live variant set.
  let query = supabase
    .from("storefront_products")
    .select(PRODUCT_PUBLIC_SELECT)
    .eq("status", "published")
    .or(publishDateLiveFilter());

  if (featuredOnly) query = query.eq("featured", true);
  if (sorting === "price-asc") query = query.order("price", { ascending: true });
  else if (sorting === "price-desc") query = query.order("price", { ascending: false });
  else if (sorting === "top-rated") query = query.order("rating", { ascending: false }).order("review_count", { ascending: false });
  else query = query.order("created_at", { ascending: false });

  const { data, error } = await query.limit(safeLimit * 3);
  if (error) throw new Error(`getAllActiveProducts failed: ${error.message}`);
  const rows = ((data as ProductRow[]) ?? []);
  const ctx = await loadDisplayContext(rows);
  const cards = rows.map((row) => toProductCard(row, ctx));
  const variantsByProduct = await getVariantsForProducts(cards.map((card) => card.id));
  const withStock = cards.map((card) => attachVariantDerivedFields(card, variantsByProduct.get(card.id) ?? []));
  return withStock.filter((card) => card.inStock).slice(0, safeLimit);
}

export async function getActiveProductsByIds(ids: string[], limit = 20): Promise<Product[]> {
  const selected = [...new Set(ids.filter(Boolean))].slice(0, Math.max(1, Math.min(limit, 20)));
  if (!selected.length) return [];
  const { data, error } = await supabase
    .from("storefront_products")
    .select(PRODUCT_PUBLIC_SELECT)
    .in("id", selected)
    .eq("status", "published")
    .or(publishDateLiveFilter());
  if (error) throw new Error(`getActiveProductsByIds failed: ${error.message}`);
  const rows = ((data as ProductRow[]) ?? []);
  const ctx = await loadDisplayContext(rows);
  const byId = new Map(rows.map((row) => [row.id, toProductCard(row, ctx)]));
  const cards = selected.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []);
  const variantsByProduct = await getVariantsForProducts(cards.map((card) => card.id));
  return cards.map((card) => attachVariantDerivedFields(card, variantsByProduct.get(card.id) ?? []));
}

export type MarketplaceCatalogFilters = Partial<Record<
  "audience" | "brand" | "mainCategory" | "productType" | "collection" | "material" | "fit" | "size" | "color" | "price" | "availability" | "rating" | "featured" | "discounted",
  string[]
>>;

export type MarketplaceCatalogOptions = {
  search?: string;
  sort?: "newest" | "price-asc" | "price-desc" | "top-rated";
  page?: number;
  pageSize?: number;
  filters?: MarketplaceCatalogFilters;
};

// Level-3 (Product Type) node ids whose resolved path matches the given
// Main Category / Product Type name filters — used to translate a
// name-based filter selection into a `product_type_id` list the DB query
// can actually filter on, since products no longer store those names.
function matchingProductTypeIds(
  tree: TaxonomyNode[],
  mainCategories?: string[],
  productTypes?: string[]
): string[] {
  return tree
    .filter((node) => node.level === 3)
    .filter((leaf) => {
      const path = resolveTaxonomyPath(tree, leaf.id);
      if (!path) return false;
      if (mainCategories?.length && !mainCategories.includes(path.mainCategory)) return false;
      if (productTypes?.length && !productTypes.includes(path.productTypeName)) return false;
      return true;
    })
    .map((leaf) => leaf.id);
}

// Resolves which product ids have at least one non-archived variant whose
// selected option value (of the given system option key, "size" or
// "color") has a label in `labels` — used to translate a facet filter
// into a product id list, since sizes/colors are no longer flat columns
// on products.
async function resolveProductIdsByVariantOptionLabel(optionKey: "size" | "color", labels: string[]): Promise<string[]> {
  const { data, error } = await supabase
    .from("product_variant_values")
    .select("product_variants!inner(product_id, is_archived), option_values!inner(label, option_types!inner(key))")
    .eq("product_variants.is_archived", false)
    .eq("option_values.option_types.key", optionKey)
    .in("option_values.label", labels);
  if (error) throw new Error(`resolveProductIdsByVariantOptionLabel(${optionKey}) failed: ${error.message}`);
  const rows = (data ?? []) as unknown as { product_variants: { product_id: string } }[];
  return [...new Set(rows.map((r) => r.product_variants.product_id))];
}

async function resolveProductIdsByAvailability(inStock: boolean): Promise<string[]> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("product_id, quantity, selling_status, is_archived")
    .eq("is_archived", false);
  if (error) throw new Error(`resolveProductIdsByAvailability failed: ${error.message}`);
  const byProduct = new Map<string, boolean>();
  for (const row of data ?? []) {
    const purchasable = row.selling_status === "active" && row.quantity > 0;
    byProduct.set(row.product_id, (byProduct.get(row.product_id) ?? false) || purchasable);
  }
  return [...byProduct.entries()].filter(([, hasStock]) => hasStock === inStock).map(([id]) => id);
}

export async function getMarketplaceCatalogPage(options: MarketplaceCatalogOptions = {}) {
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 24, 48));
  const page = Math.max(1, options.page ?? 1);
  const filters = options.filters ?? {};

  const needsTaxonomyLookup = Boolean(filters.mainCategory?.length || filters.productType?.length);
  const needsCollectionLookup = Boolean(filters.collection?.length);
  const [taxonomyTree, collectionIds, sizeProductIds, colorProductIds, availabilityProductIds] = await Promise.all([
    needsTaxonomyLookup ? getFullTaxonomyTree() : Promise.resolve<TaxonomyNode[]>([]),
    needsCollectionLookup ? resolveCollectionIdsByName(filters.collection!) : Promise.resolve<string[] | null>(null),
    filters.size?.length ? resolveProductIdsByVariantOptionLabel("size", filters.size) : Promise.resolve<string[] | null>(null),
    filters.color?.length ? resolveProductIdsByVariantOptionLabel("color", filters.color) : Promise.resolve<string[] | null>(null),
    filters.availability?.length === 1
      ? resolveProductIdsByAvailability(filters.availability[0] === "in-stock")
      : Promise.resolve<string[] | null>(null),
  ]);

  // storefront_products (supabase/migrations/
  // 20260814000006_storefront_launch_gate_view.sql) is a security_invoker
  // view over `products` that adds the product-launch gate (a
  // zakhnook_fulfilled brand's product stays hidden until first_stocked_at
  // is set) on top of the same RLS/publish-visibility rules `products`
  // itself already enforces — never a client-built brand-id list.
  let query = supabase
    .from("storefront_products")
    .select(PRODUCT_PUBLIC_SELECT, { count: "exact" })
    .eq("status", "published")
    .or(publishDateLiveFilter());

  const search = options.search?.trim().replace(/[%_,().]/g, " ").replace(/\s+/g, " ").slice(0, 80);
  if (search) query = query.or(`name.ilike.%${search}%,brand_name.ilike.%${search}%`);
  if (filters.audience?.length) query = query.in("audience", filters.audience);
  if (filters.brand?.length) query = query.in("brand_name", filters.brand);
  if (needsTaxonomyLookup) {
    const ids = matchingProductTypeIds(taxonomyTree, filters.mainCategory, filters.productType);
    query = query.in("product_type_id", ids.length ? ids : ["__none__"]);
  }
  if (needsCollectionLookup) {
    query = query.in("collection_id", collectionIds && collectionIds.length ? collectionIds : ["__none__"]);
  }
  if (filters.material?.length) query = query.in("material", filters.material);
  if (filters.fit?.length) query = query.in("fit", filters.fit);
  if (sizeProductIds) query = query.in("id", sizeProductIds.length ? sizeProductIds : ["__none__"]);
  if (colorProductIds) query = query.in("id", colorProductIds.length ? colorProductIds : ["__none__"]);
  if (filters.price?.length) {
    const range = parsePriceRangeValue(filters.price[0]);
    if (range) query = query.gte("price", range.min).lte("price", range.max);
  }
  if (availabilityProductIds) query = query.in("id", availabilityProductIds.length ? availabilityProductIds : ["__none__"]);
  if (filters.rating?.length) query = query.gte("rating", filters.rating.includes("3-plus") ? 3 : 4);
  if (filters.featured?.length) query = query.eq("featured", true);
  // Unlike the old compare_at_price check, this is a same-row-to-`now()`
  // comparison (not a same-row column-to-column one), so it can be a plain
  // query filter — no separate id-resolving lookup needed.
  if (filters.discounted?.length) {
    query = query
      .gt("discount_percent", 0)
      .or(`discount_ends_at.is.null,discount_ends_at.gt.${new Date().toISOString()}`);
  }

  // NOTE: price-range filtering and price-asc/desc sorting below still
  // operate on the base `price` column, not the discounted effective
  // price — a product discounted from 100 to 90 is still bucketed/sorted
  // at 100. Fixing that needs a generated column or view; left as a known,
  // deliberate gap rather than silently wrong.
  const sort = options.sort ?? "newest";
  if (sort === "price-asc") query = query.order("price", { ascending: true });
  else if (sort === "price-desc") query = query.order("price", { ascending: false });
  else if (sort === "top-rated") query = query.order("rating", { ascending: false }).order("review_count", { ascending: false });
  else query = query.order("created_at", { ascending: false });

  const from = (page - 1) * pageSize;
  const { data, count, error } = await query.range(from, from + pageSize - 1);
  if (error) throw new Error(`getMarketplaceCatalogPage failed: ${error.message}`);
  const rows = ((data as ProductRow[]) ?? []);
  const ctx = await loadDisplayContext(rows);
  const cards = rows.map((row) => toProductCard(row, ctx));
  const variantsByProduct = await getVariantsForProducts(cards.map((card) => card.id));
  return {
    products: cards.map((card) => attachVariantDerivedFields(card, variantsByProduct.get(card.id) ?? [])),
    total: count ?? 0,
    page,
    pageSize,
  };
}

async function resolveCollectionIdsByName(names: string[]): Promise<string[]> {
  const { data, error } = await supabase.from("collections").select("id, name").in("name", names);
  if (error) throw new Error(`resolveCollectionIdsByName failed: ${error.message}`);
  return (data ?? []).map((row) => row.id as string);
}

export interface MarketplaceCatalogFacetRow {
  brand: string;
  category: CategorySlug;
  mainCategory?: string;
  productType?: string;
  collection?: string;
  material?: string;
  fit?: string;
  sizes: string[];
  colors: ProductColorOption[];
  discountPercent?: number;
  discountEndsAt?: string;
  price: number;
}

export async function getMarketplaceCatalogFacets(): Promise<MarketplaceCatalogFacetRow[]> {
  const { data, error } = await supabase
    .from("storefront_products")
    .select("id, brand_name, audience, product_type_id, collection_id, material, fit, discount_percent, discount_ends_at, price")
    .eq("status", "published")
    .or(publishDateLiveFilter())
    .limit(2000);

  if (error) throw new Error(`getMarketplaceCatalogFacets failed: ${error.message}`);
  const rows = (data ?? []) as {
    id: string;
    brand_name: string;
    audience: Audience;
    product_type_id: string;
    collection_id: string | null;
    material: string | null;
    fit: string | null;
    discount_percent: number | null;
    discount_ends_at: string | null;
    price: number;
  }[];

  const collectionIds = [...new Set(rows.map((r) => r.collection_id).filter((v): v is string => Boolean(v)))];
  const [taxonomyTree, collectionNamesById, variantsByProduct] = await Promise.all([
    getFullTaxonomyTree(),
    loadCollectionNames(collectionIds),
    getVariantsForProducts(rows.map((r) => r.id)),
  ]);

  return rows.map((row) => {
    const path = resolveTaxonomyPath(taxonomyTree, row.product_type_id);
    const variants = variantsByProduct.get(row.id) ?? [];
    const sizes = [
      ...new Set(variants.flatMap((v) => v.optionValues.filter((o) => o.optionTypeName === "Size").map((o) => o.label))),
    ];
    const colorMap = new Map<string, ProductColorOption>();
    for (const variant of variants) {
      for (const option of variant.optionValues) {
        if (option.optionTypeName === "Color" && !colorMap.has(option.optionValueId)) {
          colorMap.set(option.optionValueId, { name: option.label, hex: option.primaryColor ?? "#D9D2C8", swatchType: option.swatchType, secondaryColor: option.secondaryColor });
        }
      }
    }
    return {
      brand: row.brand_name,
      category: primaryShopCategoryForAudience(row.audience),
      mainCategory: path?.mainCategory,
      productType: path?.productTypeName,
      collection: row.collection_id ? collectionNamesById.get(row.collection_id) : undefined,
      material: row.material ?? undefined,
      fit: row.fit ?? undefined,
      sizes,
      colors: [...colorMap.values()],
      discountPercent: row.discount_percent ?? undefined,
      discountEndsAt: row.discount_ends_at ?? undefined,
      price: Number(row.price),
    };
  });
}

export async function getProductById(id: string): Promise<ProductDetail | null> {
  const { data, error } = await supabase
    .from("storefront_products")
    .select(PRODUCT_PUBLIC_SELECT)
    .eq("id", id)
    .maybeSingle();

  // A real fetch/connection error should surface as an error page.
  // `data === null` with no error just means "no product with this id",
  // which is a normal 404, not a failure. A non-published row (draft,
  // pending review, archived, etc.) is treated the same as "not found" —
  // this is the public product page, never an authenticated preview.
  if (error) {
    throw new Error(`getProductById(${id}) failed: ${error.message}`);
  }
  // storefront_products already filters to customer-visible rows (status
  // = 'published', among other predicates — see
  // private.is_product_customer_visible), so a Paused product's status is
  // 'paused' and it never reaches this query at all. The explicit status
  // check here is defense in depth, not the primary gate.
  if (
    !data ||
    (data as ProductRow).status !== "published" ||
    !isPublishDateLive((data as ProductRow).publish_date)
  )
    return null;

  const row = data as ProductRow;
  const ctx = await loadDisplayContext([row]);

  const variantsByProduct = await getVariantsForProducts([id]);
  const variants = variantsByProduct.get(id) ?? [];
  const detail = attachVariantDerivedFields(toProductDetail(row, ctx), variants);

  // Shipping & Returns is resolved from the owning Brand's policy (falling
  // back to the marketplace default), not stored per-product — see
  // lib/admin/shippingPolicy.ts. Overrides the legacy shipping_returns
  // column value already set by toProductDetail() above.
  const { data: brandPolicyRow } = await supabase
    .from("brands")
    .select("shipping_policy, return_policy, return_window_days")
    .eq("id", row.brand_id)
    .maybeSingle();
  const resolvedPolicy = resolveShippingPolicy(brandPolicyRow ? {
    shippingPolicy: brandPolicyRow.shipping_policy as string | null,
    returnPolicy: brandPolicyRow.return_policy as string | null,
    returnWindowDays: brandPolicyRow.return_window_days as number | null,
  } : null);
  detail.shippingReturns = resolvedPolicy.text;

  const sizeAvailability = new Map<string, boolean>();
  for (const variant of variants) {
    const sizeLabel = variant.optionValues.find((o) => o.optionTypeName === "Size")?.label;
    if (!sizeLabel) continue;
    const purchasable = variant.sellingStatus === "active" && variant.quantity > 0 && !variant.isArchived;
    sizeAvailability.set(sizeLabel, (sizeAvailability.get(sizeLabel) ?? false) || purchasable);
  }
  detail.unavailableSizes = detail.sizes.filter((size) => !sizeAvailability.get(size));

  // product_media is the single source of truth for both the ordered
  // gallery and the Color -> image mapping (unifies what used to be two
  // tables: product_media itself, plus the older product_color_images).
  // Every write path (admin/brand-portal create+edit, notification revert)
  // already replaces both in lockstep, so this is safe for any product
  // saved since product_media was introduced. A product that predates it
  // and was never resaved since falls back to the flattened `products.images`
  // column (row.image + row.images) with no color-specific image — it will
  // pick up per-color images automatically the next time it's saved.
  // product_color_images is intentionally no longer read here; it remains
  // a temporary compatibility write-only table (see replaceProductColorImages).
  const { data: orderedMedia } = await supabase
    .from("product_media")
    .select("storage_reference, color_option_value_id, option_values:color_option_value_id(label)")
    .eq("product_id", id)
    .eq("is_archived", false)
    .order("display_order", { ascending: true });
  const mediaRows = (orderedMedia ?? []) as unknown as {
    storage_reference: string;
    color_option_value_id: string | null;
    option_values: { label: string } | null;
  }[];
  detail.colorImages = Object.fromEntries(
    mediaRows
      .filter((r) => r.color_option_value_id && r.option_values)
      .map((r) => [r.option_values!.label, r.storage_reference])
  );
  detail.images = mediaRows.length
    ? mediaRows.map((media) => media.storage_reference)
    : [...new Set([row.image, ...detail.images].filter(Boolean))];

  // Related products: same Product Type as this one. product_type_id is
  // NOT NULL post-migration, but this query still guards against a falsy
  // value defensively (`.eq()` with a JS null/undefined value sends the
  // literal string "null" to PostgREST, which fails a uuid column outright
  // rather than matching no rows).
  if (!row.product_type_id) {
    detail.relatedIds = [];
    return detail;
  }

  const { data: relatedRows, error: relatedError } = await supabase
    .from("storefront_products")
    .select("id")
    .neq("id", id)
    .eq("status", "published")
    .or(publishDateLiveFilter())
    .eq("product_type_id", row.product_type_id)
    .limit(4);

  if (relatedError) {
    // Related products are supplementary, not critical — degrade quietly
    // rather than failing the whole product page over a secondary query.
    logError("Related products query failed", relatedError.message);
    detail.relatedIds = [];
  } else {
    detail.relatedIds = (relatedRows ?? []).map((r) => r.id as string);
  }

  return detail;
}

function escapeLikePattern(value: string): string {
  // Escape LIKE/ILIKE wildcard characters so user input is matched
  // literally instead of being interpreted as a wildcard pattern.
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

// Shared by both search functions below: the two parameterized ilike
// queries (name, brand) instead of one interpolated `.or()` filter string
// — user input never gets parsed as PostgREST filter syntax — deduped and
// capped at `limit`.
async function runProductSearch(query: string, limit: number): Promise<ProductRow[]> {
  const q = query.trim();
  if (!q) return [];

  const pattern = `%${escapeLikePattern(q)}%`;

  const [byName, byBrand] = await Promise.all([
    supabase
      .from("storefront_products")
      .select(PRODUCT_PUBLIC_SELECT)
      .ilike("name", pattern)
      .eq("status", "published")
      .or(publishDateLiveFilter())
      .limit(limit),
    supabase
      .from("storefront_products")
      .select(PRODUCT_PUBLIC_SELECT)
      .ilike("brand_name", pattern)
      .eq("status", "published")
      .or(publishDateLiveFilter())
      .limit(limit),
  ]);

  if (byName.error || byBrand.error) {
    throw new Error(
      (byName.error ?? byBrand.error)?.message ?? "Search failed"
    );
  }

  const seen = new Set<string>();
  const merged = [...(byName.data ?? []), ...(byBrand.data ?? [])].filter(
    (row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    }
  );

  return (merged as ProductRow[]).slice(0, limit);
}

export interface SearchResult {
  id: string;
  name: string;
  brand: string;
  price: number;
  currency: "USD" | "EGP";
  image: string;
  href: string;
}

// Lightweight rows for the header's live autocomplete dropdown — a plain
// thumbnail/name/price row, not a product card, so it skips the taxonomy/
// variants lookups searchProductCards() below needs.
export async function searchProducts(
  query: string,
  limit: number = 24
): Promise<SearchResult[]> {
  const rows = await runProductSearch(query, limit);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    brand: row.brand_name,
    price: Number(row.price),
    currency: row.currency,
    image: row.image,
    href: `/product/${row.id}`,
  }));
}

// Full product cards for the /search results grid.
export async function searchProductCards(
  query: string,
  limit: number = 24
): Promise<Product[]> {
  const rows = await runProductSearch(query, limit);
  const ctx = await loadDisplayContext(rows);
  const cards = rows.map((row) => toProductCard(row, ctx));
  const variantsByProduct = await getVariantsForProducts(cards.map((card) => card.id));
  return cards.map((card) => attachVariantDerivedFields(card, variantsByProduct.get(card.id) ?? []));
}
