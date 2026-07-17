import { supabase } from "@/lib/supabase/client";
import { CategorySlug, ProductColorOption, ProductRecord } from "@/types";

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

function toProductRecord(row: ProductRow): ProductRecord {
  return {
    id: row.id,
    name: row.name,
    brandName: row.brand_name,
    brandSlug: row.brand_slug ?? undefined,
    category: row.category ?? undefined,
    price: Number(row.price),
    currency: row.currency,
    image: row.image,
    images: row.images ?? [],
    colors: row.colors ?? [],
    sizes: row.sizes ?? [],
    description: row.description,
    details: row.details ?? [],
    careInstructions: row.care_instructions ?? [],
    shippingReturns: row.shipping_returns,
    sku: row.sku,
    inStock: row.in_stock,
    isNew: row.is_new,
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

export async function getProductForAdmin(id: string): Promise<ProductRecord | null> {
  const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();

  if (error) {
    throw new Error(`getProductForAdmin(${id}) failed: ${error.message}`);
  }
  if (!data) return null;
  return toProductRecord(data as ProductRow);
}
