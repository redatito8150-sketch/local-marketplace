import { supabaseAdmin } from "@/lib/supabase/admin";

interface AnalyticsOrderItemRow {
  product_id: string | null;
  name: string;
  brand: string;
  price: number;
  currency: "USD" | "EGP";
  quantity: number;
}

interface AnalyticsOrderRow {
  created_at: string;
  subtotal_egp: number;
  order_items: AnalyticsOrderItemRow[];
}

export interface RevenueSummary {
  today: number;
  week: number;
  month: number;
}

export interface TopProductEntry {
  productId: string | null;
  name: string;
  brand: string;
  quantity: number;
  revenue: number;
}

export interface TopBrandEntry {
  brand: string;
  revenue: number;
}

export interface DailyRevenuePoint {
  label: string;
  amount: number;
}

// Cancelled orders never contributed real revenue — excluded everywhere here.
async function getRevenueEligibleOrders(): Promise<AnalyticsOrderRow[]> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("created_at, subtotal_egp, order_items(product_id, name, brand, price, currency, quantity)")
    .neq("status", "cancelled");

  if (error) {
    throw new Error(`getRevenueEligibleOrders failed: ${error.message}`);
  }
  return (data as AnalyticsOrderRow[]) ?? [];
}

export async function getRevenueSummary(): Promise<RevenueSummary> {
  const orders = await getRevenueEligibleOrders();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);
  const startOfMonth = new Date(startOfToday);
  startOfMonth.setDate(startOfMonth.getDate() - 29);

  let today = 0;
  let week = 0;
  let month = 0;
  for (const order of orders) {
    const created = new Date(order.created_at);
    const amount = Number(order.subtotal_egp);
    if (created >= startOfToday) today += amount;
    if (created >= startOfWeek) week += amount;
    if (created >= startOfMonth) month += amount;
  }
  return { today, week, month };
}

// Trailing-30-day window — the standard definition for "top products/brands"
// on a dashboard; with this catalog's order volume still low, this can read
// as all-time in practice, but the window is the correct long-term default.
export async function getTopProducts(limit = 5, days = 30): Promise<TopProductEntry[]> {
  const orders = await getRevenueEligibleOrders();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const byProduct = new Map<string, TopProductEntry>();
  for (const order of orders) {
    if (new Date(order.created_at) < cutoff) continue;
    for (const item of order.order_items ?? []) {
      // Historical USD-priced items are excluded — mixing them into an
      // EGP-labeled revenue figure would misrepresent what was charged,
      // same principle as subtotal_usd being excluded from getRevenueSummary.
      if (item.currency !== "EGP") continue;
      const key = item.product_id ?? item.name;
      const existing = byProduct.get(key) ?? {
        productId: item.product_id,
        name: item.name,
        brand: item.brand,
        quantity: 0,
        revenue: 0,
      };
      existing.quantity += item.quantity;
      existing.revenue += Number(item.price) * item.quantity;
      byProduct.set(key, existing);
    }
  }
  return [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

export async function getTopBrands(limit = 5, days = 30): Promise<TopBrandEntry[]> {
  const orders = await getRevenueEligibleOrders();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const byBrand = new Map<string, number>();
  for (const order of orders) {
    if (new Date(order.created_at) < cutoff) continue;
    for (const item of order.order_items ?? []) {
      if (item.currency !== "EGP") continue;
      byBrand.set(item.brand, (byBrand.get(item.brand) ?? 0) + Number(item.price) * item.quantity);
    }
  }
  return [...byBrand.entries()]
    .map(([brand, revenue]) => ({ brand, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export interface CategoryRevenueEntry {
  category: string;
  revenue: number;
}

interface CategoryOrderItemRow {
  price: number;
  currency: "USD" | "EGP";
  quantity: number;
  products: { product_category: string | null } | null;
}

interface CategoryOrderRow {
  created_at: string;
  order_items: CategoryOrderItemRow[];
}

// Joins through products (not stored redundantly on order_items) — an item
// whose product was later deleted has no category to attribute to, so it's
// bucketed as "Uncategorized" rather than dropped, keeping the total in
// sync with getDailyRevenueTrend's for the same window.
export async function getRevenueByCategory(days = 30): Promise<CategoryRevenueEntry[]> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("created_at, order_items(price, currency, quantity, products(product_category))")
    .neq("status", "cancelled");

  if (error) {
    throw new Error(`getRevenueByCategory failed: ${error.message}`);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const byCategory = new Map<string, number>();
  for (const order of (data as unknown as CategoryOrderRow[]) ?? []) {
    if (new Date(order.created_at) < cutoff) continue;
    for (const item of order.order_items ?? []) {
      if (item.currency !== "EGP") continue;
      const category = item.products?.product_category ?? "Uncategorized";
      byCategory.set(category, (byCategory.get(category) ?? 0) + Number(item.price) * item.quantity);
    }
  }

  return [...byCategory.entries()]
    .map(([category, revenue]) => ({ category, revenue }))
    .sort((a, b) => b.revenue - a.revenue);
}

export async function getDailyRevenueTrend(days = 14): Promise<DailyRevenuePoint[]> {
  const orders = await getRevenueEligibleOrders();
  const now = new Date();
  const points: DailyRevenuePoint[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);

    const amount = orders
      .filter((o) => {
        const created = new Date(o.created_at);
        return created >= day && created < nextDay;
      })
      .reduce((sum, o) => sum + Number(o.subtotal_egp), 0);

    points.push({
      label: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      amount,
    });
  }
  return points;
}
