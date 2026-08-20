"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import DateRangePicker from "@/components/ui/DateRangePicker";
import type { BrandOrder } from "@/lib/data/brandPortal";
import { formatPrice } from "@/lib/format";
import {
  buildBrandPerformanceSeries, cairoDateKey, daysBetweenInclusive, percentageChange,
  shiftDateKey, summarizeBrandPerformance, type AnalyticsMetric,
} from "@/lib/analytics/brandPerformance";

const METRICS: Array<{ key: AnalyticsMetric; label: string }> = [
  { key: "sales", label: "Net sales" },
  { key: "orders", label: "Orders" },
  { key: "units", label: "Units sold" },
  { key: "aov", label: "Average order" },
];

const METRIC_COLORS: Record<AnalyticsMetric, string> = {
  sales: "#C85956",
  orders: "#4F766F",
  units: "#B88746",
  aov: "#75648B",
};

function metricValue(metric: AnalyticsMetric, value: number) {
  return metric === "sales" || metric === "aov" ? formatPrice(value, "EGP") : Math.round(value).toLocaleString("en-EG");
}

export default function BrandPerformanceAnalytics({ orders }: { orders: BrandOrder[] }) {
  const today = cairoDateKey(new Date());
  const [from, setFrom] = useState(shiftDateKey(today, -29));
  const [to, setTo] = useState(today);
  const [metric, setMetric] = useState<AnalyticsMetric | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const data = useMemo(() => {
    const safeFrom = from <= to ? from : to;
    const safeTo = from <= to ? to : from;
    const days = daysBetweenInclusive(safeFrom, safeTo);
    const previousTo = shiftDateKey(safeFrom, -1);
    const previousFrom = shiftDateKey(previousTo, -(days - 1));
    const series = buildBrandPerformanceSeries(orders, safeFrom, safeTo);
    const current = summarizeBrandPerformance(series);
    const previous = summarizeBrandPerformance(buildBrandPerformanceSeries(orders, previousFrom, previousTo));
    return { safeFrom, safeTo, series, current, previous, days };
  }, [from, orders, to]);

  const width = 760;
  const height = 230;
  const padX = 8;
  const padY = 18;
  const visibleMetrics = metric ? METRICS.filter((item) => item.key === metric) : METRICS;
  const chartPoints = Object.fromEntries(METRICS.map((item) => {
    const values = data.series.map((point) => point[item.key]);
    const max = Math.max(...values, 1);
    return [item.key, values.map((value, index) => ({
      x: data.series.length === 1 ? width / 2 : padX + (index / (data.series.length - 1)) * (width - padX * 2),
      y: height - padY - (value / max) * (height - padY * 2),
    }))];
  })) as Record<AnalyticsMetric, Array<{ x: number; y: number }>>;
  const chartPaths = Object.fromEntries(METRICS.map((item) => [
    item.key,
    chartPoints[item.key].map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" "),
  ])) as Record<AnalyticsMetric, string>;
  const selectedPoints = metric ? chartPoints[metric] : null;
  const selectedPath = metric ? chartPaths[metric] : "";
  const area = selectedPoints?.length ? `${selectedPath} L${selectedPoints.at(-1)!.x},${height - padY} L${selectedPoints[0].x},${height - padY} Z` : "";
  const active = activeIndex == null ? null : data.series[activeIndex];
  const interactionPoints = chartPoints[visibleMetrics[0].key] ?? [];
  const tooltipAlignment = activeIndex === 0 ? "translate-x-0" : activeIndex === data.series.length - 1 ? "-translate-x-full" : "-translate-x-1/2";

  return (
    <section aria-labelledby="analytics-title" className="relative overflow-visible rounded-[22px] border border-[#e3dcd3] bg-[#fffdf9] shadow-[0_10px_30px_rgba(67,45,29,0.045)]">
      <div className="border-b border-[#eee7de] py-4 pl-4 pr-5 sm:pl-5 sm:pr-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p id="analytics-title" className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C85956]">Performance analytics</p>
            <p className="mt-1 text-[11px] text-[#918278]">{metric ? `${METRICS.find((item) => item.key === metric)?.label} compared with the previous period` : "All trends · select a metric to focus"}</p>
          </div>
          <DateRangePicker defaultFrom={from} defaultTo={to} fromName={null} toName={null} maxDate={today} popoverAlign="right" compact onRangeChange={(range) => { if (range.from && range.to) { setFrom(range.from); setTo(range.to); } setActiveIndex(null); }} />
        </div>
      </div>

      <div className="min-w-0 pb-4">
        <div className="grid grid-cols-2 border-b border-[#eee7de] lg:grid-cols-4">
          {METRICS.map((item, index) => {
            const selected = metric === item.key;
            const visible = metric == null || selected;
            const itemChange = percentageChange(data.current[item.key], data.previous[item.key]);
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={selected}
                onClick={() => { setMetric(selected ? null : item.key); setActiveIndex(null); }}
                className={`group relative min-w-0 border-[#eee7de] px-4 py-2.5 text-left outline-none transition sm:px-5 ${index % 2 === 0 ? "border-r" : ""} ${index < 2 ? "border-b lg:border-b-0" : ""} ${index < 3 ? "lg:border-r" : ""} ${selected ? "bg-[#faf7f5]" : "hover:bg-[#fcfaf7]"} focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/30`}
              >
                <span className="absolute inset-x-4 bottom-0 h-[3px] origin-left rounded-t-full transition-transform sm:inset-x-5" style={{ backgroundColor: METRIC_COLORS[item.key], transform: visible ? "scaleX(1)" : "scaleX(0)" }} />
                <span className="flex items-center gap-1.5 text-[9px] font-bold" style={{ color: visible ? METRIC_COLORS[item.key] : "#81746a" }}><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: METRIC_COLORS[item.key] }} />{item.label}</span>
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[17px] font-extrabold tracking-[-0.035em] text-[#29231f] tabular-nums">{metricValue(item.key, data.current[item.key])}</span>
                  <ChangeBadge change={itemChange} />
                </span>
              </button>
            );
          })}
        </div>

        <div className="px-2 sm:px-4">
          <div className="relative mt-3 h-[220px] select-none" onMouseLeave={() => setActiveIndex(null)}>
            <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible" role="img" aria-label={`${metric ? METRICS.find((item) => item.key === metric)?.label : "All performance trends"} chart from ${data.safeFrom} to ${data.safeTo}`}>
              {[0.25, 0.5, 0.75, 1].map((ratio) => <line key={ratio} x1={padX} x2={width - padX} y1={height - padY - ratio * (height - padY * 2)} y2={height - padY - ratio * (height - padY * 2)} stroke="#eee6df" strokeDasharray="4 6" />)}
              <defs><linearGradient id="brandAnalyticsArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={metric ? METRIC_COLORS[metric] : "#C85956"} stopOpacity=".18" /><stop offset="100%" stopColor={metric ? METRIC_COLORS[metric] : "#C85956"} stopOpacity="0" /></linearGradient></defs>
              {area && <path d={area} fill="url(#brandAnalyticsArea)" />}
              {visibleMetrics.map((item) => <path key={item.key} d={chartPaths[item.key]} fill="none" stroke={METRIC_COLORS[item.key]} strokeWidth={metric ? 3 : 2.25} strokeLinecap="round" strokeLinejoin="round" />)}
              {interactionPoints.map((point, index) => (
                <g key={data.series[index].date}>
                  <rect x={Math.max(0, point.x - Math.max(8, width / Math.max(data.series.length, 1) / 2))} y="0" width={Math.max(16, width / Math.max(data.series.length, 1))} height={height} fill="transparent" onMouseEnter={() => setActiveIndex(index)} onFocus={() => setActiveIndex(index)} tabIndex={0} aria-label={`${data.series[index].date}: ${visibleMetrics.map((item) => `${item.label} ${metricValue(item.key, data.series[index][item.key])}`).join(", ")}`} />
                  {visibleMetrics.map((item) => { const itemPoint = chartPoints[item.key][index]; return <circle key={item.key} cx={itemPoint.x} cy={itemPoint.y} r={activeIndex === index ? 4 : metric ? 2.5 : 1.8} fill={activeIndex === index ? "#fff" : METRIC_COLORS[item.key]} stroke={METRIC_COLORS[item.key]} strokeWidth={activeIndex === index ? 2.5 : 0} />; })}
                </g>
              ))}
            </svg>
            {active && activeIndex != null && <div className={`pointer-events-none absolute z-10 min-w-[172px] ${tooltipAlignment} -translate-y-full rounded-xl border border-[#e5dbd3] bg-white/95 px-3 py-2.5 shadow-[0_12px_32px_rgba(67,45,29,.14)] backdrop-blur`} style={{ left: `${(interactionPoints[activeIndex].x / width) * 100}%`, top: metric ? `${(chartPoints[metric][activeIndex].y / height) * 100}%` : "38%" }}><p className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#9b8d82]">{new Intl.DateTimeFormat("en-EG", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${active.date}T12:00:00Z`))}</p><div className="mt-2 space-y-1.5">{visibleMetrics.map((item) => <p key={item.key} className="flex items-center justify-between gap-4 text-[10px]"><span className="inline-flex items-center gap-1.5 font-semibold text-[#71645b]"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: METRIC_COLORS[item.key] }} />{item.label}</span><span className="font-extrabold text-[#332c27] tabular-nums">{metricValue(item.key, active[item.key])}</span></p>)}</div></div>}
            {!data.series.some((point) => point.orders) && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="rounded-xl bg-[#fffdf9]/90 px-5 py-3 text-center"><p className="text-[12px] font-bold text-[#51473f]">No sales in this period</p><p className="mt-1 text-[10px] text-[#94867c]">Choose a wider date range to explore earlier activity.</p></div></div>}
          </div>
          <div className="mt-1 flex items-center justify-between px-2 text-[9.5px] text-[#a09287]"><span>{data.safeFrom}</span><span>{data.days} day{data.days === 1 ? "" : "s"}, Cairo time</span><span>{data.safeTo}</span></div>
        </div>
      </div>
    </section>
  );
}

function ChangeBadge({ change }: { change: number | null }) {
  if (change == null) return <span className="rounded-full bg-[#f2ebe5] px-1.5 py-0.5 text-[8px] font-bold text-[#75685f]">New</span>;
  const rounded = Math.abs(change).toFixed(1);
  if (Math.abs(change) < 0.05) return <span className="inline-flex items-center gap-0.5 rounded-full bg-[#f2ebe5] px-1.5 py-0.5 text-[8px] font-bold text-[#75685f]"><Minus className="h-2 w-2" />0.0%</span>;
  return <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold ${change > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{change > 0 ? <ArrowUpRight className="h-2 w-2" /> : <ArrowDownRight className="h-2 w-2" />}{rounded}%</span>;
}
