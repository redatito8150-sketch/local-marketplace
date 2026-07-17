import Image from "next/image";
import {
  BarChart3,
  LayoutDashboard,
  Megaphone,
  Package,
  Settings,
  ShoppingBag,
  Users,
  Wallet,
} from "lucide-react";
import { DASHBOARD_STATS, DASHBOARD_TOP_PRODUCTS, REVENUE_CHART } from "@/content/join";

const SIDEBAR_ITEMS = [
  { label: "Overview", icon: LayoutDashboard, active: true },
  { label: "Orders", icon: ShoppingBag },
  { label: "Products", icon: Package },
  { label: "Customers", icon: Users },
  { label: "Analytics", icon: BarChart3 },
  { label: "Marketing", icon: Megaphone },
  { label: "Payouts", icon: Wallet },
  { label: "Settings", icon: Settings },
];

const CHART_WIDTH = 600;
const CHART_HEIGHT = 220;
const CHART_PAD_X = 10;
const CHART_PAD_Y = 20;

function buildChartGeometry() {
  const { values, highlight } = REVENUE_CHART;
  const max = Math.max(...values);
  const stepX = (CHART_WIDTH - CHART_PAD_X * 2) / (values.length - 1);

  const points = values.map((value, i) => ({
    x: CHART_PAD_X + i * stepX,
    y: CHART_HEIGHT - CHART_PAD_Y - (value / max) * (CHART_HEIGHT - CHART_PAD_Y * 2),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const areaPath = `${linePath} L ${last.x} ${CHART_HEIGHT} L ${first.x} ${CHART_HEIGHT} Z`;
  const highlightPoint = points[highlight.monthIndex];

  return { points, linePath, areaPath, highlightPoint };
}

export default function BrandDashboardPreview() {
  const { linePath, areaPath, highlightPoint } = buildChartGeometry();

  return (
    <section className="mx-auto max-w-screen2xl px-8 pb-20 lg:px-12">
      <div className="grid grid-cols-1 gap-10 rounded-xl3 border border-stone-150 p-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-0 lg:p-0">
        {/* Left copy */}
        <div className="flex flex-col justify-center lg:px-12 lg:py-14">
          <h2 className="font-serif text-3xl font-semibold leading-tight text-ink lg:text-[2.2rem]">
            Your brand,
            <br />
            all in one place.
          </h2>
          <p className="mt-5 max-w-sm text-[14.5px] leading-relaxed text-ink-soft/70">
            Get full control over your products, orders, customers and
            analytics from your brand dashboard.
          </p>
        </div>

        {/* Right dashboard mockup — scrolls in its own box on mobile
            instead of forcing the page wider. */}
        <div className="overflow-x-auto lg:border-l lg:border-stone-150">
          <div className="grid min-w-[640px] grid-cols-[160px_minmax(0,1fr)] lg:min-w-0">
            {/* Sidebar */}
            <div className="border-r border-stone-150 p-5">
              <p className="mb-6 text-lg font-bold tracking-tightest text-ink">Local</p>
              <ul className="space-y-1">
                {SIDEBAR_ITEMS.map((item) => (
                  <li key={item.label}>
                    <div
                      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium ${
                        item.active
                          ? "bg-beige-100 text-ink"
                          : "text-ink-soft/60"
                      }`}
                    >
                      <item.icon className="h-4 w-4" strokeWidth={1.6} />
                      {item.label}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Main panel */}
            <div className="p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-ink">Overview</h3>
                <div className="flex items-center gap-2 text-[12px] font-medium text-ink-soft/60">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-beige-100 text-[11px] font-semibold text-ink">
                    N
                  </span>
                  NOLA
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                {DASHBOARD_STATS.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-md border border-stone-150 p-3.5"
                  >
                    <p className="text-[11px] font-medium text-ink-soft/55">{stat.label}</p>
                    <p className="mt-1.5 text-base font-semibold text-ink">{stat.value}</p>
                    <p className="mt-1 text-[10.5px] font-medium text-ink-soft/50">
                      {stat.delta}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-[minmax(0,1fr)_180px] gap-4">
                {/* Chart */}
                <div className="rounded-md border border-stone-150 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-semibold text-ink">Revenue Overview</p>
                    <span className="text-[11px] font-medium text-ink-soft/50">This Month</span>
                  </div>
                  <div className="relative mt-3">
                    <svg
                      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                      preserveAspectRatio="none"
                      className="h-[160px] w-full"
                    >
                      <defs>
                        <linearGradient id="joinRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#161513" stopOpacity="0.14" />
                          <stop offset="100%" stopColor="#161513" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={areaPath} fill="url(#joinRevenueGradient)" />
                      <path d={linePath} fill="none" stroke="#161513" strokeWidth="2" />
                      <circle
                        cx={highlightPoint.x}
                        cy={highlightPoint.y}
                        r="4"
                        fill="#161513"
                      />
                    </svg>
                    <div
                      className="pointer-events-none absolute -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-md border border-stone-150 bg-white px-2.5 py-1.5 shadow-soft"
                      style={{
                        left: `${(highlightPoint.x / CHART_WIDTH) * 100}%`,
                        top: `${(highlightPoint.y / CHART_HEIGHT) * 100}%`,
                      }}
                    >
                      <p className="text-[11px] font-semibold text-ink">
                        {REVENUE_CHART.highlight.label}
                      </p>
                      <p className="text-[10px] text-ink-soft/50">
                        {REVENUE_CHART.highlight.sublabel}
                      </p>
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] font-medium text-ink-soft/45">
                      {REVENUE_CHART.months.map((month) => (
                        <span key={month}>{month}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Top products */}
                <div className="rounded-md border border-stone-150 p-4">
                  <p className="text-[12px] font-semibold text-ink">Top Products</p>
                  <p className="text-[11px] font-medium text-ink-soft/50">3.2%</p>
                  <ul className="mt-3 space-y-2.5">
                    {DASHBOARD_TOP_PRODUCTS.map((product) => (
                      <li key={product.name} className="flex items-center gap-2.5">
                        <Image
                          src={product.image}
                          alt=""
                          width={32}
                          height={32}
                          className="h-8 w-8 flex-none rounded-md object-cover"
                        />
                        <div>
                          <p className="text-[11.5px] font-medium leading-tight text-ink">
                            {product.name}
                          </p>
                          <p className="text-[10.5px] text-ink-soft/50">{product.price}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
