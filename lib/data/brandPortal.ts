import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Every query here uses the cookie-aware anon client by default (never
// supabaseAdmin) so the brand-owner RLS policies actually do the scoping —
// the portal must never be able to see another brand's data even if a
// query here had a bug, because the database itself refuses the row.
// `impersonating` is the one deliberate exception: an admin viewing a
// brand they don't personally own would get correctly blocked by that
// same RLS policy, so requireBrandOwner() (which has already verified the
// caller really is an admin) passes this through to read via
// supabaseAdmin instead — the same trust boundary already used by every
// read in lib/data/admin.ts.

export interface BrandOrderItem {
  id: string;
  name: string;
  size: string;
  color?: string;
  price: number;
  currency: "USD" | "EGP";
  quantity: number;
}

export interface BrandOrder {
  id: string;
  orderNumber: string;
  status: string;
  shippingName: string;
  shippingCity: string;
  shippingGovernorate: string;
  createdAt: string;
  items: BrandOrderItem[];
}

interface OrderItemRow {
  id: string;
  name: string;
  size: string;
  color: string | null;
  price: number;
  currency: "USD" | "EGP";
  quantity: number;
  order_id: string;
  orders: {
    id: string;
    order_number: string;
    status: string;
    shipping_name: string;
    shipping_city: string;
    shipping_governorate: string;
    created_at: string;
  } | null;
}

// Orders containing at least one of this brand's items — only orders
// placed after brand_slug attribution shipped will appear; historical
// orders keep a null brand_slug and are correctly invisible here.
export async function getOrdersForBrand(
  brandSlug: string,
  impersonating = false
): Promise<BrandOrder[]> {
  const supabase = impersonating ? supabaseAdmin : await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("order_items")
    .select(
      "id, name, size, color, price, currency, quantity, order_id, orders(id, order_number, status, shipping_name, shipping_city, shipping_governorate, created_at)"
    )
    .eq("brand_slug", brandSlug);

  if (error) {
    throw new Error(`getOrdersForBrand(${brandSlug}) failed: ${error.message}`);
  }

  const byOrder = new Map<string, BrandOrder>();
  for (const row of (data as unknown as OrderItemRow[]) ?? []) {
    if (!row.orders) continue;
    const existing = byOrder.get(row.orders.id) ?? {
      id: row.orders.id,
      orderNumber: row.orders.order_number,
      status: row.orders.status,
      shippingName: row.orders.shipping_name,
      shippingCity: row.orders.shipping_city,
      shippingGovernorate: row.orders.shipping_governorate,
      createdAt: row.orders.created_at,
      items: [],
    };
    existing.items.push({
      id: row.id,
      name: row.name,
      size: row.size,
      color: row.color ?? undefined,
      price: Number(row.price),
      currency: row.currency,
      quantity: row.quantity,
    });
    byOrder.set(row.orders.id, existing);
  }

  return [...byOrder.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export interface BrandVariant {
  variantId: string;
  productId: string;
  productName: string;
  image: string;
  color?: string;
  size?: string;
  quantity: number;
  lowStockThreshold: number;
}

interface BrandVariantRow {
  id: string;
  product_id: string;
  color: string | null;
  size: string | null;
  quantity: number;
  low_stock_threshold: number;
  products: { id: string; name: string; image: string; brand_slug: string | null } | null;
}

// Read-only for v1 — brand owners see their stock, only admin/staff edit
// it, so inventory oversight stays centralized.
export async function getVariantsForBrand(
  brandSlug: string,
  impersonating = false
): Promise<BrandVariant[]> {
  const supabase = impersonating ? supabaseAdmin : await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_variants")
    .select("id, product_id, color, size, quantity, low_stock_threshold, products!inner(id, name, image, brand_slug)")
    .eq("products.brand_slug", brandSlug);

  if (error) {
    throw new Error(`getVariantsForBrand(${brandSlug}) failed: ${error.message}`);
  }

  return ((data as unknown as BrandVariantRow[]) ?? [])
    .filter((row) => row.products)
    .map((row) => ({
      variantId: row.id,
      productId: row.product_id,
      productName: row.products!.name,
      image: row.products!.image,
      color: row.color ?? undefined,
      size: row.size ?? undefined,
      quantity: row.quantity,
      lowStockThreshold: row.low_stock_threshold,
    }));
}

export interface BrandProductListItem {
  id: string;
  name: string;
  image: string;
  price: number;
  currency: "USD" | "EGP";
  status: string;
  pausedByBrand: boolean;
  hasPendingEdit: boolean;
  reviewNotes?: string;
  deletionRequestedAt?: string;
}

interface BrandProductRow {
  id: string;
  name: string;
  image: string;
  price: number;
  currency: "USD" | "EGP";
  status: string;
  paused_by_brand: boolean;
  pending_changes: unknown;
  review_notes: string | null;
  deletion_requested_at: string | null;
}

// Every status (pending_review/changes_requested/published/archived) shows
// here — `products` has a public `using (true)` SELECT policy already
// (needed for the storefront to read published rows with the anon client),
// so the cookie client sees every status for this brand once scoped by
// brand_slug; nothing extra needed to include unreviewed submissions.
export async function getProductsForBrand(
  brandSlug: string,
  impersonating = false
): Promise<BrandProductListItem[]> {
  const supabase = impersonating ? supabaseAdmin : await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, image, price, currency, status, paused_by_brand, pending_changes, review_notes, deletion_requested_at"
    )
    .eq("brand_slug", brandSlug)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getProductsForBrand(${brandSlug}) failed: ${error.message}`);
  }

  return ((data as BrandProductRow[]) ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    image: row.image,
    price: Number(row.price),
    currency: row.currency,
    status: row.status,
    pausedByBrand: row.paused_by_brand,
    hasPendingEdit: row.pending_changes != null,
    reviewNotes: row.review_notes ?? undefined,
    deletionRequestedAt: row.deletion_requested_at ?? undefined,
  }));
}
