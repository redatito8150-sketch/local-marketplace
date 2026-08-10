"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface BrandOption {
  id: string;
  name: string;
  // Carried through purely so the Product Editor can resolve Shipping &
  // Returns (lib/admin/shippingPolicy.ts) client-side and recompute it the
  // instant the Admin picks a different Brand — BrandSelect itself never
  // reads these.
  shippingPolicy?: string;
  returnPolicy?: string;
  returnWindowDays?: number;
  // Local Warehouse gate — the Product Editor uses this to lock the
  // Variants (Matrix)'s Opening Stock field for a Zakhnook Partner brand
  // (see VariantTable.tsx). BrandSelect itself never reads it.
  isMahalyPartner?: boolean;
}

// Searchable combobox over the real brand list — replaces the old plain
// free-text Brand input for admins. Value/onChange operate on the brand's
// real id (the ownership FK), never its slug. Accessible combobox pattern
// (role, aria-expanded/aria-controls, arrow-key navigation, Escape,
// click-outside close), modeled after this project's existing
// SearchAutocomplete/SearchableSelect conventions.
export default function BrandSelect({
  options,
  value,
  onChange,
  disabled,
}: {
  options: BrandOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selected = options.find((option) => option.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.name.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (disabled) {
    return (
      <label className="block">
        <span className="text-[12.5px] font-medium text-ink-soft/70">Brand</span>
        <div className="mt-1.5 w-full rounded-md border border-stone-150 bg-stone-50 px-3.5 py-2.5 text-[14px] text-ink-soft/70">
          {selected?.name ?? "—"}
        </div>
      </label>
    );
  }

  return (
    <div ref={containerRef} className="relative block">
      <span className="text-[12.5px] font-medium text-ink-soft/70">
        Brand<span className="text-red-600"> *</span>
      </span>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        className="mt-1.5 flex w-full items-center justify-between rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-left text-[14px] text-ink outline-none focus:border-ink/30"
      >
        <span className={selected ? "text-ink" : "text-ink-soft/45"}>
          {selected?.name ?? "Select brand"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-soft/50" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-full rounded-md border border-stone-150 bg-white shadow-card">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search brands…"
            aria-label="Search brands"
            aria-controls={listboxId}
            aria-autocomplete="list"
            className="w-full border-b border-stone-150 px-3.5 py-2.5 text-[13.5px] text-ink outline-none"
          />
          <ul id={listboxId} role="listbox" className="max-h-64 overflow-y-auto p-1.5">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-[13px] text-ink-soft/50">No brands match &quot;{query}&quot;</li>
            )}
            {filtered.map((option) => {
              const isSelected = option.id === value;
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(option.id);
                      setQuery("");
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13.5px] text-ink hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-mahalyred/30"
                  >
                    {option.name}
                    {isSelected && <Check className="h-3.5 w-3.5 text-ink" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
