import { supabase } from "@/lib/supabase/client";
export { findProductVariant, resolveProductPrice, resolveProductPricing } from "./product-selection";
export { formatPrice, getEffectivePrice, isDiscountActive } from "./pricing";

export type ProductColor = { name: string; hex?: string };
export type VariantOptionValue = {
  optionTypeName: string;
  label: string;
  primaryColor: string | null;
  secondaryColor: string | null;
};
export type ProductVariant = {
  id: string;
  product_id: string;
  quantity: number;
  variant_price: number | null;
  variant_discount_percent: number | null;
  selling_status: string;
  optionValues: VariantOptionValue[];
};
export type Product = {
  id: string;
  name: string;
  brand_name: string;
  brand_slug: string | null;
  // "men" | "women" | "unisex" | "kids_baby" — the sole source of truth for
  // who a product is for (replaces the old category/is_unisex pair).
  audience: string | null;
  // The resolved Product Type leaf (Level 3) in the hierarchical taxonomy —
  // replaces the old free-text product_category. Mobile doesn't resolve
  // this to a display path (Main Category / Product Group / Product Type)
  // the way the web app does; it's kept as an opaque id for filtering.
  product_type_id: string | null;
  price: number;
  discount_percent: number | null;
  discount_ends_at: string | null;
  currency: "EGP" | "USD";
  image: string;
  images: string[];
  rating: number;
  review_count: number;
  description: string;
  details: string[];
  care_instructions: string[];
  shipping_returns: string;
  // Derived from the product's variants (never stored flat) — every
  // product tracks inventory at variant level unconditionally now.
  colors: ProductColor[];
  sizes: string[];
  unavailable_sizes: string[];
  in_stock: boolean;
  variants?: ProductVariant[];
};

const productSelect =
  "id,name,brand_name,brand_slug,audience,product_type_id,price,discount_percent,discount_ends_at,currency,image,images,rating,review_count,description,details,care_instructions,shipping_returns";

export type ProductSort = "newest" | "price-asc" | "price-desc" | "top-rated";
export type ProductQueryOptions = {
  query?: string;
  audience?: string;
  productTypeId?: string;
  brand?: string;
  color?: string;
  size?: string;
  inStock?: boolean;
  discounted?: boolean;
  minimumRating?: number;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
  page?: number;
  sort?: ProductSort;
};

export type CatalogFacets = {
  audiences: string[];
  brands: string[];
  colors: string[];
  sizes: string[];
  price: { min: number; max: number };
};

const mediaBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

function resolveMediaUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const url = value.trim();
  if (/^(https?:|data:|file:|content:)/i.test(url)) return url;
  if (!mediaBaseUrl) return url;
  return `${mediaBaseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

function normalize(row: Record<string, unknown>): Product {
  const images = ((row.images as string[] | null) ?? [])
    .map(resolveMediaUrl)
    .filter(Boolean);
  const image = resolveMediaUrl(row.image) || images[0] || "";

  return {
    ...(row as unknown as Product),
    price: Number(row.price),
    discount_percent: row.discount_percent == null ? null : Number(row.discount_percent),
    discount_ends_at: typeof row.discount_ends_at === "string" ? row.discount_ends_at : null,
    rating: Number(row.rating ?? 0),
    review_count: Number(row.review_count ?? 0),
    image,
    images,
    details: (row.details as string[] | null) ?? [],
    care_instructions: (row.care_instructions as string[] | null) ?? [],
    colors: [],
    sizes: [],
    unavailable_sizes: [],
    in_stock: false,
  };
}

interface VariantValueJoinRow {
  variant_id: string;
  option_value_id: string;
  option_values: {
    label: string;
    primary_color: string | null;
    secondary_color: string | null;
    option_types: { name: string } | null;
  } | null;
}

// A product now tracks inventory at variant level unconditionally, so
// Color/Size/in-stock display fields are always derived from
// product_variants + product_variant_values rather than read off the
// products row directly (mirrors the web app's attachVariantDerivedFields).
async function attachVariantDerivedFields(products: Product[]): Promise<Product[]> {
  if (products.length === 0) return products;
  const productIds = products.map((p) => p.id);

  const { data: variantRows, error: variantsError } = await supabase
    .from("product_variants")
    .select("id, product_id, quantity, variant_price, variant_discount_percent, selling_status")
    .in("product_id", productIds)
    .eq("is_archived", false);
  if (variantsError) throw new Error("We couldn't load product availability.");

  const variantIds = (variantRows ?? []).map((v) => v.id as string);
  const valuesByVariant = new Map<string, VariantValueJoinRow[]>();
  if (variantIds.length > 0) {
    const { data: valueRows, error: valuesError } = await supabase
      .from("product_variant_values")
      .select("variant_id, option_value_id, option_values(label, primary_color, secondary_color, option_types(name))")
      .in("variant_id", variantIds);
    if (valuesError) throw new Error("We couldn't load product options.");
    for (const row of ((valueRows ?? []) as unknown as VariantValueJoinRow[])) {
      const list = valuesByVariant.get(row.variant_id) ?? [];
      list.push(row);
      valuesByVariant.set(row.variant_id, list);
    }
  }

  const variantsByProduct = new Map<string, ProductVariant[]>();
  for (const row of variantRows ?? []) {
    const optionValues: VariantOptionValue[] = (valuesByVariant.get(row.id as string) ?? [])
      .filter((v) => v.option_values)
      .map((v) => ({
        optionTypeName: v.option_values!.option_types?.name ?? "",
        label: v.option_values!.label,
        primaryColor: v.option_values!.primary_color,
        secondaryColor: v.option_values!.secondary_color,
      }));
    const variant: ProductVariant = {
      id: row.id as string,
      product_id: row.product_id as string,
      quantity: row.quantity as number,
      variant_price: row.variant_price == null ? null : Number(row.variant_price),
      variant_discount_percent: row.variant_discount_percent == null ? null : Number(row.variant_discount_percent),
      selling_status: row.selling_status as string,
      optionValues,
    };
    const list = variantsByProduct.get(variant.product_id) ?? [];
    list.push(variant);
    variantsByProduct.set(variant.product_id, list);
  }

  return products.map((product) => {
    const variants = variantsByProduct.get(product.id) ?? [];
    const colorNames = new Set<string>();
    const colors: ProductColor[] = [];
    const sizes = new Set<string>();
    const purchasableSizes = new Set<string>();
    let inStock = false;

    for (const variant of variants) {
      const purchasable = variant.selling_status === "active" && variant.quantity > 0;
      if (purchasable) inStock = true;
      const color = variant.optionValues.find((o) => o.optionTypeName === "Color");
      const size = variant.optionValues.find((o) => o.optionTypeName === "Size");
      if (color && !colorNames.has(color.label)) {
        colorNames.add(color.label);
        colors.push({ name: color.label, hex: color.primaryColor ?? undefined });
      }
      if (size) {
        sizes.add(size.label);
        if (purchasable) purchasableSizes.add(size.label);
      }
    }

    const unavailableSizes = [...sizes].filter((size) => !purchasableSizes.has(size));

    return {
      ...product,
      colors,
      sizes: [...sizes],
      unavailable_sizes: unavailableSizes,
      in_stock: inStock,
      variants,
    };
  });
}

export async function getProductPage(options: ProductQueryOptions = {}) {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 40);
  const page = Math.max(options.page ?? 0, 0);
  let request = supabase.from("products").select(productSelect, { count: "exact" })
    .eq("status", "published").eq("paused_by_brand", false);
  if (options.audience) request = request.eq("audience", options.audience);
  if (options.productTypeId) request = request.eq("product_type_id", options.productTypeId);
  if (options.brand) request = request.eq("brand_name", options.brand);
  if (options.discounted) {
    const discountedIds = await getDiscountedProductIds();
    if (discountedIds.length === 0) return { products: [], total: 0 };
    request = request.in("id", discountedIds);
  }
  if (options.minimumRating) request = request.gte("rating", options.minimumRating);
  if (options.minPrice != null) request = request.gte("price", options.minPrice);
  if (options.maxPrice != null) request = request.lte("price", options.maxPrice);
  if (options.query?.trim()) {
    const safe = options.query.trim().replace(/[%_,().]/g, " ").slice(0, 80);
    request = request.or(`name.ilike.%${safe}%,brand_name.ilike.%${safe}%`);
  }
  if (options.sort === "price-asc") request = request.order("price", { ascending: true });
  else if (options.sort === "price-desc") request = request.order("price", { ascending: false });
  else if (options.sort === "top-rated") request = request.order("rating", { ascending: false }).order("review_count", { ascending: false });
  else request = request.order("created_at", { ascending: false });
  const { data, count, error } = await request.range(page * limit, page * limit + limit - 1);
  if (error) throw new Error("We couldn't load products.");
  let products = await attachVariantDerivedFields((data ?? []).map((row) => normalize(row)));
  // Color/Size/in-stock are variant-derived, so those filters are applied
  // in memory after the join rather than as a query predicate.
  if (options.color) products = products.filter((p) => p.colors.some((c) => c.name === options.color));
  if (options.size) products = products.filter((p) => p.sizes.includes(options.size!));
  if (options.inStock) products = products.filter((p) => p.in_stock);
  return { products, total: count ?? 0 };
}

async function getDiscountedProductIds(now: Date = new Date()) {
  const [productResult, variantResult] = await Promise.all([
    supabase
      .from("products")
      .select("id")
      .gt("discount_percent", 0)
      .or(`discount_ends_at.is.null,discount_ends_at.gt.${now.toISOString()}`),
    supabase
      .from("product_variants")
      .select("product_id")
      .gt("variant_discount_percent", 0)
      .eq("is_archived", false),
  ]);
  if (productResult.error || variantResult.error) {
    throw new Error("We couldn't load discounted products.");
  }
  return [
    ...new Set([
      ...(productResult.data ?? []).map((row) => row.id as string),
      ...(variantResult.data ?? []).map((row) => row.product_id as string),
    ]),
  ];
}

export async function getProducts(options: ProductQueryOptions = {}) {
  return (await getProductPage(options)).products;
}

export async function getCatalogFacets(): Promise<CatalogFacets> {
  const { data, error } = await supabase.from("products")
    .select("id,audience,brand_name,price")
    .eq("status", "published").eq("paused_by_brand", false).limit(2000);
  if (error) throw new Error("We couldn't load catalog filters.");
  const rows = data ?? [];
  const products = await attachVariantDerivedFields(rows.map((row) => normalize(row)));
  const unique = (values: (string | null | undefined)[]) =>
    [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))].sort();
  return {
    audiences: unique(rows.map((row) => row.audience as string | null)),
    brands: unique(rows.map((row) => row.brand_name as string | null)),
    colors: unique(products.flatMap((p) => p.colors.map((c) => c.name))),
    sizes: unique(products.flatMap((p) => p.sizes)),
    price: {
      min: Math.min(...rows.map((row) => Number(row.price)).filter(Number.isFinite)),
      max: Math.max(...rows.map((row) => Number(row.price)).filter(Number.isFinite)),
    },
  };
}

export async function getProduct(id: string) {
  const { data, error } = await supabase.from("products").select(productSelect)
    .eq("id", id).eq("status", "published").eq("paused_by_brand", false).maybeSingle();
  if (error) throw new Error("We couldn't load this product.");
  if (!data) return null;
  const [product] = await attachVariantDerivedFields([normalize(data)]);
  return product;
}
