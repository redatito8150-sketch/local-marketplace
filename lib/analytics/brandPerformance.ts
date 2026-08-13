import type { BrandOrder } from "@/lib/data/brandPortal";

export type AnalyticsMetric = "sales" | "orders" | "units" | "aov";
export type AnalyticsPoint = { date: string; sales: number; orders: number; units: number; aov: number };

export function cairoDateKey(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

function dateFromKey(key: string) {
  return new Date(`${key}T12:00:00.000Z`);
}

export function shiftDateKey(key: string, days: number) {
  const date = dateFromKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetweenInclusive(from: string, to: string) {
  return Math.max(1, Math.round((dateFromKey(to).getTime() - dateFromKey(from).getTime()) / 86_400_000) + 1);
}

export function orderNetSales(order: BrandOrder) {
  return Math.max(0, order.brandProductsSubtotalEgp - order.brandDiscountEgp);
}

export function buildBrandPerformanceSeries(orders: BrandOrder[], from: string, to: string): AnalyticsPoint[] {
  const byDate = new Map<string, { sales: number; orders: number; units: number }>();
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const date = cairoDateKey(order.createdAt);
    if (date < from || date > to) continue;
    const current = byDate.get(date) ?? { sales: 0, orders: 0, units: 0 };
    current.sales += orderNetSales(order);
    current.orders += 1;
    current.units += order.items.reduce((sum, item) => sum + item.quantity, 0);
    byDate.set(date, current);
  }
  const result: AnalyticsPoint[] = [];
  for (let date = from; date <= to; date = shiftDateKey(date, 1)) {
    const value = byDate.get(date) ?? { sales: 0, orders: 0, units: 0 };
    result.push({ ...value, date, aov: value.orders ? value.sales / value.orders : 0 });
  }
  return result;
}

export function summarizeBrandPerformance(points: AnalyticsPoint[]) {
  const sales = points.reduce((sum, point) => sum + point.sales, 0);
  const orders = points.reduce((sum, point) => sum + point.orders, 0);
  const units = points.reduce((sum, point) => sum + point.units, 0);
  return { sales, orders, units, aov: orders ? sales / orders : 0 };
}

export function percentageChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}
