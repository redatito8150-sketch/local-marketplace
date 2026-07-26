"use client";

import { useEffect, useRef, useState } from "react";

// Dual numeric input + dual-thumb slider for the Price filter. Local state
// updates instantly (for smooth dragging/typing); the parent's onChange —
// which triggers real filtering/navigation — only fires ~400ms after the
// user stops moving/typing, so neither a slider drag nor a keystroke spams
// the filtering architecture with a change per pixel/character.
const COMMIT_DELAY_MS = 400;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// The track itself is transparent/pointer-events-none (the visible track is
// the plain divs above it) — only the thumb, styled via arbitrary
// pseudo-element variants, is interactive and visible.
const RANGE_THUMB_CLASS =
  "pointer-events-none absolute top-1/2 h-4 w-full -translate-y-1/2 cursor-pointer appearance-none bg-transparent " +
  "[&::-webkit-slider-runnable-track]:appearance-none [&::-webkit-slider-runnable-track]:bg-transparent " +
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-ink [&::-webkit-slider-thumb]:shadow-soft [&::-webkit-slider-thumb]:cursor-pointer " +
  "[&::-moz-range-track]:appearance-none [&::-moz-range-track]:bg-transparent " +
  "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-ink [&::-moz-range-thumb]:cursor-pointer";

export default function PriceRangeFilter({
  bounds,
  value,
  onChange,
}: {
  bounds: { min: number; max: number };
  value: { min: number; max: number };
  onChange: (min: number, max: number) => void;
}) {
  const [min, setMin] = useState(value.min);
  const [max, setMax] = useState(value.max);
  const [minText, setMinText] = useState(String(value.min));
  const [maxText, setMaxText] = useState(String(value.max));
  const [activeThumb, setActiveThumb] = useState<"min" | "max" | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Re-sync from outside (e.g. "Clear all filters") by adjusting state
  // during render rather than in an effect — guarded so it only fires on
  // an actual external change, not every render.
  const [prevExternal, setPrevExternal] = useState(value);
  if (prevExternal.min !== value.min || prevExternal.max !== value.max) {
    setPrevExternal(value);
    setMin(value.min);
    setMax(value.max);
    setMinText(String(value.min));
    setMaxText(String(value.max));
  }

  useEffect(() => {
    const id = setTimeout(() => {
      if (min !== value.min || max !== value.max) onChangeRef.current(min, max);
    }, COMMIT_DELAY_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max]);

  const setMinValue = (next: number) => {
    const clamped = clamp(next, bounds.min, max);
    setMin(clamped);
    setMinText(String(clamped));
  };
  const setMaxValue = (next: number) => {
    const clamped = clamp(next, min, bounds.max);
    setMax(clamped);
    setMaxText(String(clamped));
  };

  const span = Math.max(1, bounds.max - bounds.min);
  const minPct = ((min - bounds.min) / span) * 100;
  const maxPct = ((max - bounds.min) / span) * 100;

  return (
    <div className="w-full min-w-[260px] p-4">
      <div className="flex items-center gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-[11px] font-medium text-ink-soft/60">Min (EGP)</span>
          <input
            type="number"
            inputMode="numeric"
            min={bounds.min}
            max={bounds.max}
            value={minText}
            onChange={(e) => {
              const raw = e.target.value;
              setMinText(raw);
              if (raw === "") return;
              const num = Number(raw);
              if (Number.isFinite(num)) setMinValue(num);
            }}
            onBlur={() => {
              if (minText === "") setMinValue(bounds.min);
            }}
            className="h-9 w-full rounded-md border border-stone-150 px-2.5 text-[13px] text-ink outline-none focus:border-ink/30"
          />
        </label>
        <span className="mt-4 text-ink-soft/40">–</span>
        <label className="flex-1">
          <span className="mb-1 block text-[11px] font-medium text-ink-soft/60">Max (EGP)</span>
          <input
            type="number"
            inputMode="numeric"
            min={bounds.min}
            max={bounds.max}
            value={maxText}
            onChange={(e) => {
              const raw = e.target.value;
              setMaxText(raw);
              if (raw === "") return;
              const num = Number(raw);
              if (Number.isFinite(num)) setMaxValue(num);
            }}
            onBlur={() => {
              if (maxText === "") setMaxValue(bounds.max);
            }}
            className="h-9 w-full rounded-md border border-stone-150 px-2.5 text-[13px] text-ink outline-none focus:border-ink/30"
          />
        </label>
      </div>

      <div className="relative mt-5 h-4">
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-stone-150" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink"
          style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
        />
        <input
          type="range"
          aria-label="Minimum price"
          min={bounds.min}
          max={bounds.max}
          value={min}
          onPointerDown={() => setActiveThumb("min")}
          onChange={(e) => setMinValue(Number(e.target.value))}
          className={RANGE_THUMB_CLASS}
          style={{ zIndex: activeThumb === "min" ? 5 : 3 }}
        />
        <input
          type="range"
          aria-label="Maximum price"
          min={bounds.min}
          max={bounds.max}
          value={max}
          onPointerDown={() => setActiveThumb("max")}
          onChange={(e) => setMaxValue(Number(e.target.value))}
          className={RANGE_THUMB_CLASS}
          style={{ zIndex: activeThumb === "max" ? 5 : 4 }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-soft/50">
        <span>{bounds.min.toLocaleString("en-US")} EGP</span>
        <span>{bounds.max.toLocaleString("en-US")} EGP</span>
      </div>
    </div>
  );
}
