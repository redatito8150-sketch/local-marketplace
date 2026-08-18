"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

type DateRangePickerProps = {
  defaultFrom?: string;
  defaultTo?: string;
  fromName?: string | null;
  toName?: string | null;
  label?: string;
  maxDate?: string;
  className?: string;
  popoverAlign?: "left" | "right";
  compact?: boolean;
  onRangeChange?: (range: { from: string; to: string }) => void;
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
function parseDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
}

function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount, 12);
}

function formatRange(from: string, to: string) {
  const start = parseDate(from);
  const end = parseDate(to);
  if (!start) return "Select date range";
  const short = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
  const full = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });
  if (!end) return `${full.format(start)} — Select end date`;
  if (start.getFullYear() === end.getFullYear()) {
    return `${short.format(start)} — ${full.format(end)}`;
  }
  return `${full.format(start)} — ${full.format(end)}`;
}

function CalendarMonth({ month, from, to, maxDate, onSelect }: {
  month: Date;
  from: string;
  to: string;
  maxDate: string;
  onSelect: (value: string) => void;
}) {
  const monthStart = startOfMonth(month);
  const gridStart = addDays(monthStart, -monthStart.getDay());
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));

  return (
    <div className="min-w-0 flex-1">
      <p className="mb-4 text-center text-[12px] font-extrabold text-[#342d28]">
        {new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(month)}
      </p>
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((day) => <span key={day} className="pb-2 text-[9px] font-bold uppercase tracking-[0.08em] text-[#a09287]">{day}</span>)}
        {days.map((day) => {
          const key = dateKey(day);
          const outsideMonth = day.getMonth() !== month.getMonth();
          const disabled = key > maxDate || outsideMonth;
          const endpoint = !outsideMonth && (key === from || key === to);
          const between = !outsideMonth && Boolean(from && to && key > from && key < to);
          const rangeEdge = !outsideMonth && (key === from || key === to);
          return (
            <div key={key} className={`relative flex h-9 items-center justify-center ${between ? "bg-[#f9deda]" : ""} ${rangeEdge && from !== to ? "bg-[#f9deda]" : ""}`}>
              <button
                type="button"
                disabled={disabled}
                aria-label={new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(day)}
                aria-pressed={endpoint}
                onClick={() => onSelect(key)}
                className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-[10px] text-[11px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[#C85956]/35 focus-visible:ring-offset-1 ${endpoint ? "bg-[#C85956] text-white shadow-[0_4px_12px_rgba(200,89,86,.25)]" : between ? "text-[#7b3e3c] hover:bg-[#f5cbc7]" : disabled ? "cursor-default text-transparent" : "text-[#51473f] hover:bg-[#fff1ef] hover:text-[#C85956]"}`}
              >
                {day.getDate()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DateRangePicker({
  defaultFrom = "",
  defaultTo = "",
  fromName = "from",
  toName = "to",
  label = "Date range",
  maxDate = dateKey(new Date()),
  className = "",
  popoverAlign = "left",
  compact = false,
  onRangeChange,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const initialMonth = useMemo(() => startOfMonth(parseDate(defaultFrom) ?? parseDate(defaultTo) ?? new Date()), [defaultFrom, defaultTo]);
  const [visibleMonth, setVisibleMonth] = useState(initialMonth);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const selectDate = (value: string) => {
    if (!from || to) {
      setFrom(value);
      setTo("");
      return;
    }
    if (value < from) {
      setTo(from);
      setFrom(value);
      onRangeChange?.({ from: value, to: from });
    } else {
      setTo(value);
      onRangeChange?.({ from, to: value });
    }
  };

  const selectPreset = (days: number) => {
    const end = new Date();
    const start = addDays(end, -(days - 1));
    setFrom(dateKey(start));
    setTo(dateKey(end));
    setVisibleMonth(startOfMonth(start));
    onRangeChange?.({ from: dateKey(start), to: dateKey(end) });
  };

  const clearRange = () => {
    setFrom("");
    setTo("");
    onRangeChange?.({ from: "", to: "" });
  };

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className}`}>
      {fromName && <input type="hidden" name={fromName} value={from} readOnly />}
      {toName && <input type="hidden" name={toName} value={to} readOnly />}
      <span className={compact ? "sr-only" : "text-[10px] font-bold uppercase tracking-[0.1em] text-[#8d7f75]"}>{label}</span>
      <button
        type="button"
        aria-label={compact ? `${label}: ${formatRange(from, to)}` : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={compact
          ? `relative flex h-10 w-10 items-center justify-center rounded-xl border bg-white outline-none transition focus-visible:ring-4 focus-visible:ring-[#C85956]/10 ${open || from || to ? "border-[#C85956]/45 text-[#C85956]" : "border-[#e7ddd5] text-[#756960] hover:border-[#d9cbc1] hover:text-[#C85956]"}`
          : `mt-2 flex h-10 w-full items-center gap-2.5 rounded-xl border bg-white px-3 text-left text-[12px] outline-none transition focus-visible:ring-4 focus-visible:ring-[#C85956]/10 ${(from || to) ? "pr-10" : ""} ${open ? "border-[#C85956]/55" : "border-[#e7ddd5] hover:border-[#d9cbc1]"}`}
      >
        <CalendarDays className={`h-4 w-4 flex-none ${compact ? "" : "text-[#C85956]"}`} />
        {compact ? (from || to) ? <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#C85956]" /> : null : <span className={`min-w-0 flex-1 truncate ${from ? "font-semibold text-[#51473f]" : "text-[#9b8d82]"}`}>{formatRange(from, to)}</span>}
      </button>
      {!compact && (from || to) && <button type="button" aria-label="Clear date range" onClick={clearRange} className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full text-[#a09287] transition hover:bg-[#f6efea] hover:text-[#C85956] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/30"><X className="h-3.5 w-3.5" /></button>}

      {open && (
        <div role="dialog" aria-label="Choose date range" className={`absolute top-[calc(100%+10px)] z-50 w-[min(640px,calc(100vw-48px))] rounded-[20px] border border-[#e7ddd5] bg-white p-4 shadow-[0_22px_60px_rgba(62,43,31,.16)] sm:p-5 ${popoverAlign === "right" ? "right-0" : "left-0"}`}>
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-[#f0e9e3] pb-4">
            <div>
              <p className="text-[11px] font-extrabold text-[#342d28]">Choose a date range</p>
              <p className="mt-1 text-[10px] text-[#918278]">Select the first and last day.</p>
            </div>
            <div className="flex gap-1.5">
              <button type="button" aria-label="Previous month" onClick={() => setVisibleMonth((month) => addMonths(month, -1))} className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e7ddd5] text-[#665950] transition hover:border-[#C85956]/25 hover:bg-[#fff5f3] hover:text-[#C85956]"><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" aria-label="Next month" onClick={() => setVisibleMonth((month) => addMonths(month, 1))} className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e7ddd5] text-[#665950] transition hover:border-[#C85956]/25 hover:bg-[#fff5f3] hover:text-[#C85956]"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="flex gap-6">
            <CalendarMonth month={visibleMonth} from={from} to={to} maxDate={maxDate} onSelect={selectDate} />
            <div className="hidden min-w-0 flex-1 border-l border-[#f0e9e3] pl-6 sm:block">
              <CalendarMonth month={addMonths(visibleMonth, 1)} from={from} to={to} maxDate={maxDate} onSelect={selectDate} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#f0e9e3] pt-4">
            <div className="flex flex-wrap gap-1.5">
              {[7, 30, 90].map((days) => <button key={days} type="button" onClick={() => selectPreset(days)} className="h-8 rounded-lg bg-[#f8f3ef] px-3 text-[10px] font-bold text-[#6f6259] transition hover:bg-[#fff0ee] hover:text-[#C85956]">Last {days} days</button>)}
            </div>
            <div className="flex items-center gap-2">
              {compact && (from || to) ? <button type="button" onClick={() => { clearRange(); setOpen(false); }} className="h-8 rounded-lg px-3 text-[10px] font-bold text-[#756960] transition hover:bg-[#f8f3ef] hover:text-[#C85956]">Clear</button> : null}
              <button type="button" disabled={!from || !to} onClick={() => setOpen(false)} className="h-8 rounded-lg bg-[#C85956] px-4 text-[10px] font-bold text-white transition hover:bg-[#b84e4b] disabled:cursor-not-allowed disabled:opacity-40">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
