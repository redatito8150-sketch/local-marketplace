"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { MATERIALS } from "@/content/productTaxonomy";
import type { ProductMaterialEntry } from "@/types";

// Multi-material composition — replaces the old single Material dropdown.
// Selections come from the existing system Material catalog only (no
// Material creation/management here); each gets its own percentage input,
// and the running total must equal exactly 100 before publishing
// (enforced in lib/admin/productValidation.ts, not here — this component
// just displays the total and lets Draft stay incomplete).
export default function MaterialsComposer({
  value,
  onChange,
  disabled,
}: {
  value: ProductMaterialEntry[];
  onChange: (next: ProductMaterialEntry[]) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");

  const selectedNames = new Set(value.map((m) => m.material));
  const results = query.trim()
    ? MATERIALS.filter((m) => m.toLowerCase().includes(query.trim().toLowerCase()) && !selectedNames.has(m))
    : [];

  const addMaterial = (material: string) => {
    if (selectedNames.has(material)) return;
    onChange([...value, { material, percentage: 0 }]);
    setQuery("");
  };

  const updatePercentage = (index: number, percentage: number) => {
    onChange(value.map((m, i) => (i === index ? { ...m, percentage } : m)));
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const total = value.reduce((sum, m) => sum + (Number.isFinite(m.percentage) ? m.percentage : 0), 0);
  const totalRounded = Math.round(total * 100) / 100;
  const totalIsValid = value.length === 0 || Math.abs(total - 100) < 0.01;

  return (
    <div>
      <span className="text-[12.5px] font-medium text-ink-soft/70">Materials</span>

      {value.length > 0 && (
        <div className="mt-1.5 space-y-1.5">
          {value.map((m, i) => (
            <div key={m.material} className="flex items-center gap-2">
              <span className="flex-1 text-[13.5px] text-ink">{m.material}</span>
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={m.percentage}
                disabled={disabled}
                onChange={(e) => updatePercentage(i, Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                aria-label={`${m.material} percentage`}
                className="w-20 rounded-md border border-stone-150 px-2.5 py-1.5 text-right text-[13px] outline-none focus:border-ink/30 disabled:bg-stone-50"
              />
              <span className="text-[12.5px] text-ink-soft/50">%</span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                disabled={disabled}
                aria-label={`Remove ${m.material}`}
                className="rounded p-1 text-ink-soft/40 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft/40" />
        <input
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search materials…"
          aria-label="Search materials"
          className="w-full rounded-md border border-stone-150 bg-white py-2.5 pl-9 pr-3.5 text-[14px] text-ink outline-none focus:border-ink/30 disabled:cursor-not-allowed disabled:bg-stone-50"
        />
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-stone-200 bg-white py-1 shadow-lg">
            {results.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => addMaterial(m)}
                className="block w-full px-3 py-1.5 text-left text-[13px] text-ink hover:bg-stone-50"
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {value.length > 0 && (
        <p className={`mt-2 text-[12.5px] font-medium ${totalIsValid ? "text-emerald-700" : "text-amber-700"}`}>
          Total — {totalRounded}% {totalIsValid ? "" : "(must equal exactly 100% before publishing)"}
        </p>
      )}
    </div>
  );
}
