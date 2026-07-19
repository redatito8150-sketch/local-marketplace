import type { DailyRevenuePoint } from "@/lib/data/analytics";
import { formatPrice } from "@/lib/format";

const CHART_WIDTH = 600;
const CHART_HEIGHT = 160;
const CHART_PAD_X = 10;
const CHART_PAD_Y = 16;

// Hand-rolled inline SVG line chart — mirrors the same approach already
// used for the marketing site's demo chart (components/join/BrandDashboardPreview.tsx),
// just driven by real data instead of a fixture. No charting library needed
// for a single line, consistent with the project's lean dependency footprint.
export default function RevenueChart({ points }: { points: DailyRevenuePoint[] }) {
  const realMax = Math.max(...points.map((p) => p.amount), 0);
  const max = Math.max(realMax, 1); // avoid divide-by-zero when everything is 0
  const stepX = (CHART_WIDTH - CHART_PAD_X * 2) / Math.max(points.length - 1, 1);

  const coords = points.map((p, i) => ({
    x: CHART_PAD_X + i * stepX,
    y: CHART_HEIGHT - CHART_PAD_Y - (p.amount / max) * (CHART_HEIGHT - CHART_PAD_Y * 2),
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const last = coords[coords.length - 1];
  const first = coords[0];
  const areaPath =
    coords.length > 0 ? `${linePath} L ${last.x} ${CHART_HEIGHT} L ${first.x} ${CHART_HEIGHT} Z` : "";

  return (
    <div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-[140px] w-full"
      >
        <defs>
          <linearGradient id="adminRevenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#161513" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#161513" stopOpacity="0" />
          </linearGradient>
        </defs>
        {areaPath && <path d={areaPath} fill="url(#adminRevenueGradient)" />}
        {linePath && <path d={linePath} fill="none" stroke="#161513" strokeWidth="2" />}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] font-medium text-ink-soft/45">
        {points
          .filter((_, i) => i % Math.ceil(points.length / 7) === 0)
          .map((p) => (
            <span key={p.label}>{p.label}</span>
          ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-soft/50">
        Peak day: {formatPrice(realMax, "EGP")}
      </p>
    </div>
  );
}
