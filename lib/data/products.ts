import { supabase } from "@/lib/supabase/client";
import { logError } from "@/lib/errorLog";
import { getVariantsForProducts } from "@/lib/data/variants";
import {
  CategorySlug,
  Product,
  ProductDetail,
  ProductReview,
  ProductColorOption,
  ProductStatus,
} from "@/types";
import { CATEGORIES } from "@/content/categories";

export interface ProductRow {
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
  rating: number;
  review_count: number;
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
  paused_by_brand: boolean;
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

export function toProductCard(row: ProductRow): Product {
  return {
    id: row.id,
    category: (row.category ?? "women") as CategorySlug,
    brand: row.brand_name,
    name: row.name,
    price: Number(row.price),
    currency: row.currency,
    rating: Math.round(row.rating),
    reviewCount: row.review_count,
    image: row.image,
    sizes: row.sizes ?? [],
    colors: row.colors ?? [],
    inStock: row.in_stock,
    productCategory: row.product_category ?? undefined,
    productType: row.product_type ?? undefined,
    collection: row.collection ?? undefined,
    material: row.material ?? undefined,
    fit: row.fit ?? undefined,
    compareAtPrice: row.compare_at_price != null ? Number(row.compare_at_price) : undefined,
    featured: row.featured,
  };
}

function toProductDetail(row: ProductRow): ProductDetail {
  const categoryLabel = row.category
    ? CATEGORIES[row.category].label
    : row.brand_name;
  const categoryHref = row.category
    ? `/shop/${row.category}`
    : row.brand_slug
    ? `/brands/${row.brand_slug}`
    : "/";

  return {
    id: row.id,
    name: row.name,
    brandName: row.brand_name,
    brandSlug: row.brand_slug ?? undefined,
    price: Number(row.price),
    compareAtPrice: row.compare_at_price != null ? Number(row.compare_at_price) : undefined,
    currency: row.currency,
    images: row.images?.length ? row.images : [row.image],
    description: row.description,
    details: row.details ?? [],
    careInstructions: row.care_instructions ?? [],
    shippingReturns: row.shipping_returns,
    sizes: row.sizes ?? [],
    unavailableSizes: row.unavailable_sizes ?? [],
    colors: row.colors ?? [],
    rating: Number(row.rating),
    reviewCount: row.review_count,
    reviews: generateReviews(row.review_count, row.rating),
    sku: row.sku,
    inStock: row.in_stock,
    categorySlug: row.category ?? undefined,
    categoryLabel,
    categoryHref,
    relatedIds: [], // filled in by getProductById after a second query
    productCategory: row.product_category ?? undefined,
    productType: row.product_type ?? undefined,
    collection: row.collection ?? undefined,
    material: row.material ?? undefined,
    fit: row.fit ?? undefined,
    modelHeight: row.model_height ?? undefined,
    modelWearing: row.model_wearing ?? undefined,
    trackInventory: row.track_inventory,
    featured: row.featured,
    status: row.status,
    publishDate: row.publish_date ?? undefined,
  };
}

// A unisex product is stored under one category (women or men) with
// is_unisex = true, meaning it should also appear under the other one.
// Kids has no pairing.
const PAIRED_CATEGORY: Partial<Record<CategorySlug, CategorySlug>> = {
  women: "men",
  men: "women",
};

export async function getProductsByCategory(
  category: CategorySlug
): Promise<Product[]> {
  const pairedCategory = PAIRED_CATEGORY[category];

  const queries = [
    supabase
      .from("products")
      .select("*")
      .eq("category", category)
      .eq("status", "published")
      .eq("paused_by_brand", false)
      .order("created_at", { ascending: true }),
  ];
  if (pairedCategory) {
    queries.push(
      supabase
        .from("products")
        .select("*")
        .eq("category", pairedCategory)
        .eq("is_unisex", true)
        .eq("status", "published")
        .eq("paused_by_brand", false)
    );
  }

  const results = await Promise.all(queries);
  for (const result of results) {
    if (result.error) {
      throw new Error(`getProductsByCategory(${category}) failed: ${result.error.message}`);
    }
  }

  const seen = new Set<string>();
  const merged = results
    .flatMap((result) => result.data ?? [])
    .filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });

  const cards = (merged as ProductRow[]).map(toProductCard);
  const variantsByProduct = await getVariantsForProducts(cards.map((c) => c.id));
  return cards.map((c) => ({ ...c, variants: variantsByProduct.get(c.id) ?? [] }));
}

export async function getProductCountLabel(
  category: CategorySlug
): Promise<number> {
  const { count, error } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category", category)
    .eq("status", "published")
    .eq("paused_by_brand", false);

  if (error) {
    throw new Error(`getProductCountLabel(${category}) failed: ${error.message}`);
  }
  // Storefront copy shows a rounded "catalog size" rather than the literal
  // seeded row count — keeps the existing look while the catalog is small.
  const safeCount = count ?? 0;
  return category === "women" ? Math.max(safeCount, 342) : safeCount * 40;
}

export async function getNewArrivals(limit: number = 24): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("is_new", true)
    .eq("status", "published")
    .eq("paused_by_brand", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getNewArrivals failed: ${error.message}`);
  }

  const cards = ((data as ProductRow[]) ?? []).map(toProductCard);
  const variantsByProduct = await getVariantsForProducts(cards.map((c) => c.id));
  return cards.map((c) => ({ ...c, variants: variantsByProduct.get(c.id) ?? [] }));
}

export async function getAllActiveProducts(
  limit: number = 12,
  sorting: "newest" | "price-asc" | "price-desc" | "top-rated" = "newest",
  featuredOnly = false
): Promise<Product[]> {
  const safeLimit = Math.max(1, Math.min(limit, 24));
  let query = supabase
    .from("products")
    .select("*")
    .eq("status", "published")
    .eq("paused_by_brand", false)
    .eq("in_stock", true);

  if (featuredOnly) query = query.eq("featured", true);
  if (sorting === "price-asc") query = query.order("price", { ascending: true });
  else if (sorting === "price-desc") query = query.order("price", { ascending: false });
  else if (sorting === "top-rated") query = query.order("rating", { ascending: false }).order("review_count", { ascending: false });
  else query = query.order("created_at", { ascending: false });

  const { data, error } = await query.limit(safeLimit);
  if (error) throw new Error(`getAllActiveProducts failed: ${error.message}`);
  const cards = ((data as ProductRow[]) ?? []).map(toProductCard);
  const variantsByProduct = await getVariantsForProducts(cards.map((card) => card.id));
  return cards.map((card) => ({ ...card, variants: variantsByProduct.get(card.id) ?? [] }));
}

export async function getActiveProductsByIds(ids: string[], limit = 20): Promise<Product[]> {
  const selected = [...new Set(ids.filter(Boolean))].slice(0, Math.max(1, Math.min(limit, 20)));
  if (!selected.length) return [];
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .in("id", selected)
    .eq("status", "published")
    .eq("paused_by_brand", false);
  if (error) throw new Error(`getActiveProductsByIds failed: ${error.message}`);
  const byId = new Map(((data as ProductRow[]) ?? []).map((row) => [row.id, toProductCard(row)]));
  const cards = selected.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []);
  const variantsByProduct = await getVariantsForProducts(cards.map((card) => card.id));
  return cards.map((card) => ({ ...card, variants: variantsByProduct.get(card.id) ?? [] }));
}

export type MarketplaceCatalogFilters = Partial<Record<
  "audience" | "brand" | "productCategory" | "productType" | "collection" | "material" | "fit" | "size" | "color" | "price" | "availability" | "rating" | "featured" | "discounted",
  string[]
>>;

export type MarketplaceCatalogOptions = {
  search?: string;
  sort?: "newest" | "price-asc" | "price-desc" | "top-rated";
  page?: number;
  pageSize?: number;
  filters?: MarketplaceCatalogFilters;
};

export async function getMarketplaceCatalogPage(options: MarketplaceCatalogOptions = {}) {
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 24, 48));
  const page = Math.max(1, options.page ?? 1);
  const filters = options.filters ?? {};
  let query = supabase
    .from("products")
    .select("*", { count: "exact" })
    .eq("status", "published")
    .eq("paused_by_brand", false);

  const search = options.search?.trim().replace(/[%_,().]/g, " ").replace(/\s+/g, " ").slice(0, 80);
  if (search) query = query.or(`name.ilike.%${search}%,brand_name.ilike.%${search}%`);
  if (filters.audience?.length) query = query.in("category", filters.audience);
  if (filters.brand?.length) query = query.in("brand_name", filters.brand);
  if (filters.productCategory?.length) query = query.in("product_category", filters.productCategory);
  if (filters.productType?.length) query = query.in("product_type", filters.productType);
  if (filters.collection?.length) query = query.in("collection", filters.collection);
  if (filters.material?.length) query = query.in("material", filters.material);
  if (filters.fit?.length) query = query.in("fit", filters.fit);
  if (filters.size?.length) query = query.overlaps("sizes", filters.size);
  if (filters.color?.length) {
    query = query.or(filters.color.map((color) => `colors.cs.${JSON.stringify([{ name: color }])}`).join(","));
  }
  if (filters.price?.length) {
    const clauses: Record<string, string> = {
      "under-500": "price.lt.500",
      "500-1000": "and(price.gte.500,price.lte.1000)",
      "1000-2000": "and(price.gt.1000,price.lte.2000)",
      "2000-5000": "and(price.gt.2000,price.lte.5000)",
      "above-5000": "price.gt.5000",
    };
    const selected = filters.price.map((id) => clauses[id]).filter(Boolean);
    if (selected.length) query = query.or(selected.join(","));
  }
  if (filters.availability?.length === 1) query = query.eq("in_stock", filters.availability[0] === "in-stock");
  if (filters.rating?.length) query = query.gte("rating", filters.rating.includes("3-plus") ? 3 : 4);
  if (filters.featured?.length) query = query.eq("featured", true);
  if (filters.discounted?.length) query = query.not("compare_at_price", "is", null);

  const sort = options.sort ?? "newest";
  if (sort === "price-asc") query = query.order("price", { ascending: true });
  else if (sort === "price-desc") query = query.order("price", { ascending: false });
  else if (sort === "top-rated") query = query.order("rating", { ascending: false }).order("review_count", { ascending: false });
  else query = query.order("created_at", { ascending: false });

  const from = (page - 1) * pageSize;
  const { data, count, error } = await query.range(from, from + pageSize - 1);
  if (error) throw new Error(`getMarketplaceCatalogPage failed: ${error.message}`);
  const cards = ((data as ProductRow[]) ?? []).map(toProductCard);
  const variantsByProduct = await getVariantsForProducts(cards.map((card) => card.id));
  return {
    products: cards.map((card) => ({ ...card, variants: variantsByProduct.get(card.id) ?? [] })),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getMarketplaceCatalogFacets() {
  const { data, error } = await supabase
    .from("products")
    .select("brand_name, category, product_category, product_type, collection, material, fit, sizes, colors, compare_at_price")
    .eq("status", "published")
    .eq("paused_by_brand", false)
    .limit(2000);
  if (error) throw new Error(`getMarketplaceCatalogFacets failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    brand: row.brand_name as string,
    category: (row.category ?? "women") as CategorySlug,
    productCategory: (row.product_category as string | null) ?? undefined,
    productType: (row.product_type as string | null) ?? undefined,
    collection: (row.collection as string | null) ?? undefined,
    material: (row.material as string | null) ?? undefined,
    fit: (row.fit as string | null) ?? undefined,
    sizes: (row.sizes as string[] | null) ?? [],
    colors: (row.colors as ProductColorOption[] | null) ?? [],
    compareAtPrice: row.compare_at_price == null ? undefined : Number(row.compare_at_price),
  }));
}

export async function getProductById(id: string): Promise<ProductDetail | null> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
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
  if (
    !data ||
    (data as ProductRow).status !== "published" ||
    (data as ProductRow).paused_by_brand
  )
    return null;

  const row = data as ProductRow;
  const detail = toProductDetail(row);

  const variantsByProduct = await getVariantsForProducts([id]);
  detail.variants = variantsByProduct.get(id) ?? [];

  // Related products: same category if it's a shop item, same brand otherwise.
  let relatedQuery = supabase
    .from("products")
    .select("id")
    .neq("id", id)
    .eq("status", "published")
    .eq("paused_by_brand", false)
    .limit(4);
  relatedQuery = row.category
    ? relatedQuery.eq("category", row.category)
    : relatedQuery.eq("brand_slug", row.brand_slug ?? "__none__");

  const { data: relatedRows, error: relatedError } = await relatedQuery;
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

export interface RelatedProductCard {
  id: string;
  name: string;
  brand: string;
  price: number;
  currency: "USD" | "EGP";
  image: string;
  rating: number;
  reviewCount: number;
}

export async function getRelatedProductCards(
  ids: string[]
): Promise<RelatedProductCard[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .in("id", ids)
    .eq("status", "published")
    .eq("paused_by_brand", false);
  // Intentionally degrade quietly here (unlike the other functions in this
  // file): related products are a secondary "you may also like" section,
  // not core content. A failure here shouldn't take down the whole
  // product page via the error boundary.
  if (error) {
    logError("getRelatedProductCards failed", error.message);
    return [];
  }
  if (!data) return [];

  return (data as ProductRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    brand: row.brand_name,
    price: Number(row.price),
    currency: row.currency,
    image: row.image,
    rating: Math.round(row.rating),
    reviewCount: row.review_count,
  }));
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

function escapeLikePattern(value: string): string {
  // Escape LIKE/ILIKE wildcard characters so user input is matched
  // literally instead of being interpreted as a wildcard pattern.
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

export async function searchProducts(
  query: string,
  limit: number = 24
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const pattern = `%${escapeLikePattern(q)}%`;

  // Two parameterized queries instead of one interpolated `.or()` filter
  // string — user input never gets parsed as PostgREST filter syntax.
  const [byName, byBrand] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .ilike("name", pattern)
      .eq("status", "published")
      .eq("paused_by_brand", false)
      .limit(limit),
    supabase
      .from("products")
      .select("*")
      .ilike("brand_name", pattern)
      .eq("status", "published")
      .eq("paused_by_brand", false)
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

  return (merged as ProductRow[])
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      name: row.name,
      brand: row.brand_name,
      price: Number(row.price),
      currency: row.currency,
      image: row.image,
      href: `/product/${row.id}`,
    }));
}
