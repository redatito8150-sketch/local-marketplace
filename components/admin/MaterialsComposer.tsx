"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { MATERIAL_GROUPS } from "@/content/materials";
import type { ProductMaterialEntry } from "@/types";

// Multi-material composition — replaces the old single Material dropdown.
// Selections come from the existing system Material catalog only (no
// Material creation/management here); each gets its own percentage input,
// and the running total must equal exactly 100 before publishing
// (enforced in lib/admin/productValidation.ts, not here — this component
// just displays the total and lets Draft stay incomplete). Grouped and
// collapsed by default, same browsing pattern as Care Instructions —
// click a group to see just its own options; search bypasses groups
// entirely and flattens matches.
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
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const selectedNames = new Set(value.map((m) => m.material));

  const addMaterial = (material: string) => {
    if (selectedNames.has(material)) return;
    onChange([...value, { material, percentage: 0 }]);
  };

  const updatePercentage = (index: number, percentage: number) => {
    onChange(value.map((m, i) => (i === index ? { ...m, percentage } : m)));
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return MATERIAL_GROUPS.flatMap((group) => group.options.filter((m) => m.toLowerCase().includes(q) && !selectedNames.has(m)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, value]);

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
      </div>

      {searchResults ? (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-stone-150 p-2">
          {searchResults.length === 0 && <p className="px-2 py-3 text-[12.5px] text-ink-soft/50">No matches.</p>}
          <div className="flex flex-wrap gap-1.5 px-1">
            {searchResults.map((m) => (
              <button
                key={m}
                type="button"
                disabled={disabled}
                onClick={() => addMaterial(m)}
                className="rounded-full border border-stone-200 px-3 py-1.5 text-[12px] font-medium text-ink-soft/70 hover:border-ink/40"
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-1.5 rounded-md border border-stone-150 p-1.5">
          {MATERIAL_GROUPS.map((group) => {
            const isOpen = openGroup === group.group;
            const availableInGroup = group.options.filter((m) => !selectedNames.has(m));
            return (
              <div key={group.group} className="overflow-hidden rounded-md">
                <button
                  type="button"
                  onClick={() => setOpenGroup(isOpen ? null : group.group)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-stone-50"
                >
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-ink-soft/40" /> : <ChevronRight className="h-3.5 w-3.5 text-ink-soft/40" />}
                  <span className="text-[12.5px] font-semibold text-ink">{group.group}</span>
                </button>
                {isOpen && (
                  <div className="flex flex-wrap gap-1.5 px-2 pb-2.5 pt-1">
                    {availableInGroup.length === 0 && <span className="text-[11.5px] text-ink-soft/45">All added</span>}
                    {availableInGroup.map((m) => (
                      <button
                        key={m}
                        type="button"
                        disabled={disabled}
                        onClick={() => addMaterial(m)}
                        className="rounded-full border border-stone-200 px-3 py-1.5 text-[12px] font-medium text-ink-soft/70 hover:border-ink/40"
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {value.length > 0 && (
        <p className={`mt-2 text-[12.5px] font-medium ${totalIsValid ? "text-emerald-700" : "text-amber-700"}`}>
          Total — {totalRounded}% {totalIsValid ? "" : "(must equal exactly 100% before publishing)"}
        </p>
      )}
    </div>
  );
}
