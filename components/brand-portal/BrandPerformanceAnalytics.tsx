"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarDays, Minus, MousePointer2 } from "lucide-react";
import type { BrandOrder } from "@/lib/data/brandPortal";
import { formatPrice } from "@/lib/format";
import {
  buildBrandPerformanceSeries, cairoDateKey, daysBetweenInclusive, percentageChange,
  shiftDateKey, summarizeBrandPerformance, type AnalyticsMetric,
} from "@/lib/analytics/brandPerformance";

const METRICS: Array<{ key: AnalyticsMetric; label: string }> = [
  { key: "sales", label: "Net sales" }, { key: "orders", label: "Orders" },
  { key: "units", label: "Units sold" }, { key: "aov", label: "Average order" },
];
const PRESETS = [{ days: 7, label: "7 days" }, { days: 30, label: "30 days" }, { days: 90, label: "90 days" }];

function metricValue(metric: AnalyticsMetric, value: number) {
  return metric === "sales" || metric === "aov" ? formatPrice(value, "EGP") : Math.round(value).toLocaleString("en-EG");
}

export default function BrandPerformanceAnalytics({ orders }: { orders: BrandOrder[] }) {
  const today = cairoDateKey(new Date());
  const [from, setFrom] = useState(shiftDateKey(today, -29));
  const [to, setTo] = useState(today);
  const [metric, setMetric] = useState<AnalyticsMetric>("sales");
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

  const currentValue = data.current[metric];
  const previousValue = data.previous[metric];
  const change = percentageChange(currentValue, previousValue);
  const values = data.series.map((point) => point[metric]);
  const max = Math.max(...values, 1);
  const width = 760;
  const height = 230;
  const padX = 18;
  const padY = 18;
  const points = values.map((value, index) => ({
    x: data.series.length === 1 ? width / 2 : padX + (index / (data.series.length - 1)) * (width - padX * 2),
    y: height - padY - (value / max) * (height - padY * 2),
  }));
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const area = points.length ? `${path} L${points.at(-1)!.x},${height - padY} L${points[0].x},${height - padY} Z` : "";
  const active = activeIndex == null ? null : data.series[activeIndex];

  const applyPreset = (days: number) => {
    setTo(today);
    setFrom(shiftDateKey(today, -(days - 1)));
    setActiveIndex(null);
  };

  return (
    <section aria-labelledby="analytics-title" className="overflow-hidden rounded-[22px] border border-[#e3dcd3] bg-[#fffdf9] shadow-[0_10px_30px_rgba(67,45,29,0.045)]">
      <div className="border-b border-[#eee7de] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C85956]">Performance analytics</p>
            <h2 id="analytics-title" className="mt-1.5 text-[18px] font-extrabold tracking-[-0.025em] text-[#332c27]">Understand what is driving your business</h2>
            <p className="mt-1 text-[12px] text-[#81746a]">Live brand sales, orders and units compared with the previous period.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => {
              const selected = data.days === preset.days && data.safeTo === today;
              return <button key={preset.days} type="button" onClick={() => applyPreset(preset.days)} className={`h-8 rounded-lg px-3 text-[10.5px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25 ${selected ? "bg-[#332c27] text-white" : "border border-[#e3d9d1] bg-white text-[#71645b] hover:border-[#C85956]/30 hover:text-[#C85956]"}`}>{preset.label}</button>;
            })}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(150px,210px)_minmax(150px,210px)_1fr] sm:items-end">
          <label className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#8d7f75]">From<input type="date" value={from} max={to} onChange={(event) => { setFrom(event.target.value); setActiveIndex(null); }} className="mt-1.5 h-10 w-full rounded-xl border border-[#e7ddd5] bg-white px-3 text-[11.5px] font-medium normal-case tracking-normal text-[#51473f] outline-none focus:border-[#C85956]/55" /></label>
          <label className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#8d7f75]">To<input type="date" value={to} min={from} max={today} onChange={(event) => { setTo(event.target.value); setActiveIndex(null); }} className="mt-1.5 h-10 w-full rounded-xl border border-[#e7ddd5] bg-white px-3 text-[11.5px] font-medium normal-case tracking-normal text-[#51473f] outline-none focus:border-[#C85956]/55" /></label>
          <p className="inline-flex items-center gap-2 text-[10.5px] text-[#94867c] sm:justify-self-end sm:pb-3"><CalendarDays className="h-3.5 w-3.5" />{data.days} day{data.days === 1 ? "" : "s"}, Cairo time</p>
        </div>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_250px]">
        <div className="min-w-0 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold text-[#81746a]">{METRICS.find((item) => item.key === metric)?.label}</p>
              <div className="mt-1.5 flex flex-wrap items-end gap-3">
                <p className="text-[30px] font-extrabold tracking-[-0.05em] text-[#242424] tabular-nums">{metricValue(metric, currentValue)}</p>
                <ChangeBadge change={change} />
              </div>
              <p className="mt-1 text-[10.5px] text-[#9a8d83]">Compared with the preceding {data.days}-day period</p>
            </div>
            <div className="flex flex-wrap gap-1 rounded-xl bg-[#f5eee8] p-1">
              {METRICS.map((item) => <button key={item.key} type="button" onClick={() => { setMetric(item.key); setActiveIndex(null); }} className={`rounded-lg px-2.5 py-2 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25 ${metric === item.key ? "bg-white text-[#C85956] shadow-[0_2px_8px_rgba(67,45,29,.08)]" : "text-[#81746a] hover:text-[#51473f]"}`}>{item.label}</button>)}
            </div>
          </div>

          <div className="relative mt-6 h-[250px] select-none" onMouseLeave={() => setActiveIndex(null)}>
            <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible" role="img" aria-label={`${METRICS.find((item) => item.key === metric)?.label} chart from ${data.safeFrom} to ${data.safeTo}`}>
              {[0.25, 0.5, 0.75, 1].map((ratio) => <line key={ratio} x1={padX} x2={width - padX} y1={height - padY - ratio * (height - padY * 2)} y2={height - padY - ratio * (height - padY * 2)} stroke="#eee6df" strokeDasharray="4 6" />)}
              <defs><linearGradient id="brandAnalyticsArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#C85956" stopOpacity=".2" /><stop offset="100%" stopColor="#C85956" stopOpacity="0" /></linearGradient></defs>
              {area && <path d={area} fill="url(#brandAnalyticsArea)" />}
              {path && <path d={path} fill="none" stroke="#C85956" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
              {points.map((point, index) => <g key={data.series[index].date}><rect x={Math.max(0, point.x - Math.max(8, width / Math.max(data.series.length, 1) / 2))} y="0" width={Math.max(16, width / Math.max(data.series.length, 1))} height={height} fill="transparent" onMouseEnter={() => setActiveIndex(index)} onFocus={() => setActiveIndex(index)} tabIndex={0} aria-label={`${data.series[index].date}: ${metricValue(metric, data.series[index][metric])}`} /><circle cx={point.x} cy={point.y} r={activeIndex === index ? 5 : 2.5} fill={activeIndex === index ? "#fff" : "#C85956"} stroke="#C85956" strokeWidth={activeIndex === index ? 3 : 0} /></g>)}
            </svg>
            {active && activeIndex != null && <div className="pointer-events-none absolute z-10 min-w-[142px] -translate-x-1/2 -translate-y-full rounded-xl border border-[#e5dbd3] bg-white/95 px-3 py-2.5 shadow-[0_12px_32px_rgba(67,45,29,.14)] backdrop-blur" style={{ left: `${(points[activeIndex].x / width) * 100}%`, top: `${(points[activeIndex].y / height) * 100}%` }}><p className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#9b8d82]">{new Intl.DateTimeFormat("en-EG", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${active.date}T12:00:00Z`))}</p><p className="mt-1 text-[13px] font-extrabold text-[#332c27] tabular-nums">{metricValue(metric, active[metric])}</p><p className="mt-1 text-[9.5px] text-[#81746a]">{active.orders} orders · {active.units} units</p></div>}
            {!data.series.some((point) => point.orders) && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="rounded-xl bg-[#fffdf9]/90 px-5 py-3 text-center"><p className="text-[12px] font-bold text-[#51473f]">No sales in this period</p><p className="mt-1 text-[10px] text-[#94867c]">Choose a wider date range to explore earlier activity.</p></div></div>}
          </div>
          <div className="mt-1 flex items-center justify-between text-[9.5px] text-[#a09287]"><span>{data.safeFrom}</span><span className="hidden items-center gap-1 sm:inline-flex"><MousePointer2 className="h-3 w-3" />Hover or focus a point for details</span><span>{data.safeTo}</span></div>
        </div>

        <div className="grid grid-cols-2 border-t border-[#eee7de] bg-[#faf6f2] xl:grid-cols-1 xl:border-l xl:border-t-0">
          {METRICS.map((item) => <button key={item.key} type="button" onClick={() => { setMetric(item.key); setActiveIndex(null); }} className={`border-b border-r border-[#eee7de] px-4 py-5 text-left transition last:border-b-0 even:border-r-0 xl:border-r-0 ${metric === item.key ? "bg-[#fffdf9]" : "hover:bg-white/70"}`}><p className="text-[10px] font-bold text-[#8d7f75]">{item.label}</p><p className={`mt-2 text-[18px] font-extrabold tracking-[-0.035em] tabular-nums ${metric === item.key ? "text-[#C85956]" : "text-[#332c27]"}`}>{metricValue(item.key, data.current[item.key])}</p><p className="mt-1 text-[9.5px] text-[#9b8e84]">Selected period</p></button>)}
        </div>
      </div>
    </section>
  );
}

function ChangeBadge({ change }: { change: number | null }) {
  if (change == null) return <span className="mb-1.5 rounded-full bg-[#f2ebe5] px-2.5 py-1 text-[10px] font-bold text-[#75685f]">New activity</span>;
  const rounded = Math.abs(change).toFixed(1);
  if (Math.abs(change) < 0.05) return <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-[#f2ebe5] px-2.5 py-1 text-[10px] font-bold text-[#75685f]"><Minus className="h-3 w-3" />0.0%</span>;
  return <span className={`mb-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${change > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{change > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{rounded}%</span>;
}
