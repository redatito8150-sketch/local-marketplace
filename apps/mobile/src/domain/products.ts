import { supabase } from "@/lib/supabase/client";

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

export async function getProducts(options: { query?: string; category?: string; limit?: number } = {}) {
  let request = supabase.from("products").select(productSelect)
    .eq("status", "published").eq("paused_by_brand", false)
    .order("created_at", { ascending: false }).limit(options.limit ?? 30);
  if (options.category) request = request.eq("category", options.category);
  if (options.query?.trim()) {
    const safe = options.query.trim().replace(/[%_,().]/g, " ").slice(0, 80);
    request = request.or(`name.ilike.%${safe}%,brand_name.ilike.%${safe}%`);
  }
  const { data, error } = await request;
  if (error) throw new Error("We couldn't load products.");
  return (data ?? []).map((row) => normalize(row));
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

export function formatPrice(amount: number, currency: "EGP" | "USD") {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "EGP" ? 0 : 2
  }).format(amount);
}
