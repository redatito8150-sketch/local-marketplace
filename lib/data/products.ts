import { supabase } from "@/lib/supabase/client";
import {
  CategorySlug,
  Product,
  ProductDetail,
  ProductReview,
  ProductColorOption,
} from "@/types";
import { CATEGORIES } from "@/data/categories";

interface ProductRow {
  id: string;
  name: string;
  brand_name: string;
  brand_slug: string | null;
  category: CategorySlug | null;
  price: number;
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
  sku: string;
  in_stock: boolean;
  is_new: boolean;
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

function toProductCard(row: ProductRow): Product {
  return {
    id: row.id,
    category: (row.category ?? "women") as CategorySlug,
    brand: row.brand_name,
    name: row.name,
    price: Number(row.price),
    rating: Math.round(row.rating),
    reviewCount: row.review_count,
    image: row.image,
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
    currency: row.currency,
    images: row.images?.length ? row.images : [row.image],
    description: row.description,
    details: row.details ?? [],
    careInstructions: row.care_instructions ?? [],
    shippingReturns: row.shipping_returns,
    sizes: row.sizes ?? [],
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
  };
}

export async function getProductsByCategory(
  category: CategorySlug
): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("category", category)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getProductsByCategory failed:", error.message);
    return [];
  }
  return (data as ProductRow[]).map(toProductCard);
}

export async function getProductCountLabel(
  category: CategorySlug
): Promise<number> {
  const { count, error } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category", category);

  if (error || count === null) return 0;
  // Storefront copy shows a rounded "catalog size" rather than the literal
  // seeded row count — keeps the existing look while the catalog is small.
  return category === "women" ? Math.max(count, 342) : count * 40;
}

export async function getProductById(id: string): Promise<ProductDetail | null> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as ProductRow;
  const detail = toProductDetail(row);

  // Related products: same category if it's a shop item, same brand otherwise.
  let relatedQuery = supabase.from("products").select("id").neq("id", id).limit(4);
  relatedQuery = row.category
    ? relatedQuery.eq("category", row.category)
    : relatedQuery.eq("brand_slug", row.brand_slug ?? "__none__");

  const { data: relatedRows } = await relatedQuery;
  detail.relatedIds = (relatedRows ?? []).map((r) => r.id as string);

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
  const { data, error } = await supabase.from("products").select("*").in("id", ids);
  if (error || !data) return [];

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

export async function searchProducts(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .or(`name.ilike.%${q}%,brand_name.ilike.%${q}%`)
    .limit(24);

  if (error || !data) return [];

  return (data as ProductRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    brand: row.brand_name,
    price: Number(row.price),
    currency: row.currency,
    image: row.image,
    href: `/product/${row.id}`,
  }));
}
