import { supabase } from "@/lib/supabase/client";
export { findProductVariant, resolveProductPrice } from "./product-selection";
export { calculateDiscountPercent, formatPrice } from "./pricing";

export type ProductColor = { name: string; hex?: string };
export type ProductVariant = {
  id: string;
  product_id: string;
  color: string | null;
  size: string | null;
  price_override: number | null;
  quantity: number;
  availability_status: string;
};
export type Product = {
  id: string;
  name: string;
  brand_name: string;
  brand_slug: string | null;
  category: string | null;
  product_category: string | null;
  price: number;
  compare_at_price: number | null;
  currency: "EGP" | "USD";
  image: string;
  images: string[];
  rating: number;
  review_count: number;
  colors: ProductColor[];
  sizes: string[];
  unavailable_sizes: string[];
  description: string;
  details: string[];
  care_instructions: string[];
  shipping_returns: string;
  in_stock: boolean;
  track_inventory: boolean;
  variants?: ProductVariant[];
};

const productSelect = "id,name,brand_name,brand_slug,category,product_category,price,compare_at_price,currency,image,images,rating,review_count,colors,sizes,unavailable_sizes,description,details,care_instructions,shipping_returns,in_stock,track_inventory";

export type ProductSort = "newest" | "price-asc" | "price-desc" | "top-rated";
export type ProductQueryOptions = {
  query?: string;
  category?: string;
  brand?: string;
  color?: string;
  size?: string;
  inStock?: boolean;
  discounted?: boolean;
  minimumRating?: number;
  limit?: number;
  page?: number;
  sort?: ProductSort;
};

export type CatalogFacets = {
  categories: string[];
  productCategories: string[];
  brands: string[];
  colors: string[];
  sizes: string[];
};

function normalize(row: Record<string, unknown>): Product {
  return {
    ...(row as unknown as Product),
    price: Number(row.price),
    compare_at_price: row.compare_at_price == null ? null : Number(row.compare_at_price),
    rating: Number(row.rating ?? 0),
    review_count: Number(row.review_count ?? 0),
    images: (row.images as string[] | null) ?? [],
    colors: (row.colors as ProductColor[] | null) ?? [],
    sizes: (row.sizes as string[] | null) ?? [],
    unavailable_sizes: (row.unavailable_sizes as string[] | null) ?? [],
    details: (row.details as string[] | null) ?? [],
    care_instructions: (row.care_instructions as string[] | null) ?? []
  };
}

export async function getProductPage(options: ProductQueryOptions = {}) {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 40);
  const page = Math.max(options.page ?? 0, 0);
  let request = supabase.from("products").select(productSelect, { count: "exact" })
    .eq("status", "published").eq("paused_by_brand", false);
  if (options.category) request = request.eq("category", options.category);
  if (options.brand) request = request.eq("brand_name", options.brand);
  if (options.color) request = request.contains("colors", [{ name: options.color }]);
  if (options.size) request = request.contains("sizes", [options.size]);
  if (options.inStock) request = request.eq("in_stock", true);
  if (options.discounted) request = request.not("compare_at_price", "is", null);
  if (options.minimumRating) request = request.gte("rating", options.minimumRating);
  if (options.query?.trim()) {
    const safe = options.query.trim().replace(/[%_,().]/g, " ").slice(0, 80);
    request = request.or(`name.ilike.%${safe}%,brand_name.ilike.%${safe}%,category.ilike.%${safe}%,product_category.ilike.%${safe}%`);
  }
  if (options.sort === "price-asc") request = request.order("price", { ascending: true });
  else if (options.sort === "price-desc") request = request.order("price", { ascending: false });
  else if (options.sort === "top-rated") request = request.order("rating", { ascending: false }).order("review_count", { ascending: false });
  else request = request.order("created_at", { ascending: false });
  const { data, count, error } = await request.range(page * limit, page * limit + limit - 1);
  if (error) throw new Error("We couldn't load products.");
  return { products: (data ?? []).map((row) => normalize(row)), total: count ?? 0 };
}

export async function getProducts(options: ProductQueryOptions = {}) {
  return (await getProductPage(options)).products;
}

export async function getCatalogFacets(): Promise<CatalogFacets> {
  const { data, error } = await supabase.from("products")
    .select("category,product_category,brand_name,colors,sizes")
    .eq("status", "published").eq("paused_by_brand", false).limit(2000);
  if (error) throw new Error("We couldn't load catalog filters.");
  const rows = data ?? [];
  const unique = (values: (string | null | undefined)[]) =>
    [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))].sort();
  return {
    categories: unique(rows.map((row) => row.category)),
    productCategories: unique(rows.map((row) => row.product_category)),
    brands: unique(rows.map((row) => row.brand_name)),
    colors: unique(rows.flatMap((row) => ((row.colors as ProductColor[] | null) ?? []).map((color) => color.name))),
    sizes: unique(rows.flatMap((row) => (row.sizes as string[] | null) ?? [])),
  };
}

export async function getProduct(id: string) {
  const { data, error } = await supabase.from("products").select(productSelect)
    .eq("id", id).eq("status", "published").eq("paused_by_brand", false).maybeSingle();
  if (error) throw new Error("We couldn't load this product.");
  if (!data) return null;
  const product = normalize(data);
  const { data: variants } = await supabase.from("product_variants")
    .select("id,product_id,color,size,price_override,quantity,availability_status")
    .eq("product_id", id);
  return { ...product, variants: (variants ?? []) as ProductVariant[] };
}
