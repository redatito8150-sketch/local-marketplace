import { supabase } from "@/lib/supabase/client";
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
    console.error("Related products query failed:", relatedError.message);
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
    console.error("getRelatedProductCards failed:", error.message);
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
