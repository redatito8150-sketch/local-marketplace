import Link from "next/link";
import {
  getDailyRevenueTrend,
  getTopProducts,
  getTopBrands,
  getRevenueByCategory,
} from "@/lib/data/analytics";
import { formatPrice } from "@/lib/format";
import RevenueChart from "@/components/admin/RevenueChart";

const RANGES = [7, 30, 90] as const;

function parseDays(value?: string): (typeof RANGES)[number] {
  const n = Number(value);
  return (RANGES as readonly number[]).includes(n) ? (n as (typeof RANGES)[number]) : 30;
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  const days = parseDays(searchParams.days);

  const [trend, topProducts, topBrands, categoryRevenue] = await Promise.all([
    getDailyRevenueTrend(days),
    getTopProducts(20, days),
    getTopBrands(20, days),
    getRevenueByCategory(days),
  ]);

  const totalRevenue = trend.reduce((sum, p) => sum + p.amount, 0);
  const maxCategoryRevenue = Math.max(...categoryRevenue.map((c) => c.revenue), 1);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-ink">Analytics</h1>
          <p className="mt-1 text-[13.5px] text-ink-soft/60">
            A deeper look at revenue, top sellers, and category performance.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-stone-150 bg-white p-1">
          {RANGES.map((range) => (
            <Link
              key={range}
              href={`/admin/analytics?days=${range}`}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                days === range ? "bg-beige-100 text-ink" : "text-ink-soft/60 hover:text-ink"
              }`}
            >
              {range}d
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-xl3 border border-stone-150 bg-white p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-[13px] font-semibold text-ink">
              Daily Revenue (last {days} days)
            </p>
            <p className="text-[13px] font-semibold text-ink">{formatPrice(totalRevenue, "EGP")}</p>
          </div>
          <div className="mt-3">
            <RevenueChart points={trend} />
          </div>
        </div>

        <div className="rounded-xl3 border border-stone-150 bg-white p-5">
          <p className="text-[13px] font-semibold text-ink">Revenue by Category</p>
          <ul className="mt-3 space-y-3">
            {categoryRevenue.map((c) => (
              <li key={c.category}>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="font-medium text-ink">{c.category}</span>
                  <span className="text-ink-soft/60">{formatPrice(c.revenue, "EGP")}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                  <div
                    className="h-full rounded-full bg-ink"
                    style={{ width: `${(c.revenue / maxCategoryRevenue) * 100}%` }}
                  />
                </div>
              </li>
            ))}
            {categoryRevenue.length === 0 && (
              <p className="text-[12px] text-ink-soft/50">No sales in this range.</p>
            )}
          </ul>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl3 border border-stone-150 bg-white p-5">
          <p className="text-[13px] font-semibold text-ink">Top Products ({days} days)</p>
          <ul className="mt-3 divide-y divide-stone-150">
            {topProducts.map((p, i) => (
              <li
                key={p.productId ?? p.name}
                className="flex items-center justify-between gap-2 py-2 first:pt-0"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-4 text-[11px] font-semibold text-ink-soft/40">{i + 1}</span>
                  <div>
                    <p className="text-[12.5px] font-medium text-ink">{p.name}</p>
                    <p className="text-[11px] text-ink-soft/50">{p.brand} · Qty {p.quantity}</p>
                  </div>
                </div>
                <p className="text-[12px] font-semibold text-ink">{formatPrice(p.revenue, "EGP")}</p>
              </li>
            ))}
            {topProducts.length === 0 && (
              <p className="py-2 text-[12px] text-ink-soft/50">No sales in this range.</p>
            )}
          </ul>
        </div>

        <div className="rounded-xl3 border border-stone-150 bg-white p-5">
          <p className="text-[13px] font-semibold text-ink">Top Brands ({days} days)</p>
          <ul className="mt-3 divide-y divide-stone-150">
            {topBrands.map((b, i) => (
              <li key={b.brand} className="flex items-center justify-between gap-2 py-2 first:pt-0">
                <div className="flex items-center gap-2.5">
                  <span className="w-4 text-[11px] font-semibold text-ink-soft/40">{i + 1}</span>
                  <p className="text-[12.5px] font-medium text-ink">{b.brand}</p>
                </div>
                <p className="text-[12px] font-semibold text-ink">{formatPrice(b.revenue, "EGP")}</p>
              </li>
            ))}
            {topBrands.length === 0 && (
              <p className="py-2 text-[12px] text-ink-soft/50">No sales in this range.</p>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
