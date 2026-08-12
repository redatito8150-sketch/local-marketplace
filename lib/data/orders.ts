import { supabaseAdmin } from "@/lib/supabase/admin";
import type { OrderRecord } from "@/types";

interface OrderRow {
  id: string;
  order_number: string;
  status: OrderRecord["status"];
  shipping_name: string;
  shipping_email: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_city: string;
  shipping_governorate: string;
  subtotal_usd: number;
  subtotal_egp: number;
  discount_amount_egp: number;
  created_at: string;
  order_group_id: string;
  fulfillment_type: OrderRecord["fulfillmentType"];
  brand_slug: string | null;
  shipping_fee_egp: number;
  payment_method: OrderRecord["paymentMethod"];
  payment_status: OrderRecord["paymentStatus"];
  payment_attempt_id: string | null;
  order_items: {
    id: string;
    product_id: string | null;
    name: string;
    brand: string;
    price: number;
    currency: "USD" | "EGP";
    size: string;
    color: string | null;
    quantity: number;
    image: string;
  }[];
  order_status_history: {
    id: string;
    status: OrderRecord["status"];
    note: string | null;
    created_at: string;
  }[];
}

function toOrderRecord(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    shippingName: row.shipping_name,
    shippingEmail: row.shipping_email,
    shippingPhone: row.shipping_phone,
    shippingAddress: row.shipping_address,
    shippingCity: row.shipping_city,
    shippingGovernorate: row.shipping_governorate,
    subtotalUsd: Number(row.subtotal_usd),
    subtotalEgp: Number(row.subtotal_egp),
    discountAmountEgp: Number(row.discount_amount_egp),
    createdAt: row.created_at,
    orderGroupId: row.order_group_id,
    fulfillmentType: row.fulfillment_type,
    brandSlug: row.brand_slug ?? undefined,
    shippingFeeEgp: Number(row.shipping_fee_egp),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    paymentAttemptId: row.payment_attempt_id ?? undefined,
    items: row.order_items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      name: item.name,
      brand: item.brand,
      price: Number(item.price),
      currency: item.currency,
      size: item.size,
      color: item.color ?? undefined,
      quantity: item.quantity,
      image: item.image,
    })),
    statusHistory: (row.order_status_history ?? [])
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((h) => ({
        id: h.id,
        status: h.status,
        note: h.note ?? undefined,
        createdAt: h.created_at,
      })),
  };
}

const ORDER_SELECT = "*, order_items(*), order_status_history(id, status, note, created_at)";

// Uses supabaseAdmin (not the cookie-bound server client) so this can be
// called from any server context with just a resolved userId — same
// convention as lib/data/follows.ts. The caller (requireUser()-gated pages
// only) is what keeps this to "my own orders."
export async function getOrdersForUser(userId: string): Promise<OrderRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(ORDER_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getOrdersForUser(${userId}) failed: ${error.message}`);
  }
  return (data as OrderRow[]).map(toOrderRecord);
}

export interface OrderStats {
  total: number;
  completed: number;
  cancelled: number;
}

// Real account-activity stats replacing a rewards-points scheme that never
// existed in the schema — no "comments on products" count, since there's no
// reviews/comments system anywhere in this codebase.
export async function getOrderStats(userId: string): Promise<OrderStats> {
  const [{ count: total }, { count: completed }, { count: cancelled }] = await Promise.all([
    supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "fulfilled"),
    supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "cancelled"),
  ]);

  return {
    total: total ?? 0,
    completed: completed ?? 0,
    cancelled: cancelled ?? 0,
  };
}
