"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, X } from "lucide-react";

export interface PickerProduct {
  id: string;
  name: string;
  image: string;
  brandName: string;
}

// Multi-select for "which products show up when this mood is opened" —
// the catalog list is fetched once by the parent form (ShopByMoodForm) and
// shared across every tile's picker instance, rather than each one
// re-fetching the whole published catalog. Selection is purely local;
// the parent form persists it as part of the whole tiles array on submit.
export default function MoodProductPicker({
  title,
  catalog,
  initialSelected,
  onSave,
  onClose,
}: {
  title: string;
  catalog: PickerProduct[];
  initialSelected: string[];
  onSave: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [query, setQuery] = useState("");

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? catalog.filter((p) => p.name.toLowerCase().includes(q) || p.brandName.toLowerCase().includes(q))
    : catalog;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-150 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-ink">Choose products</h2>
            <p className="text-[12px] text-ink-soft/60">For &quot;{title}&quot; — {selected.size} selected</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-stone-150 px-5 py-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products by name or brand"
            className="w-full rounded-full border border-stone-150 px-4 py-2 text-[13px] outline-none focus:border-ink/30"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {catalog.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink-soft/60">No published products yet.</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink-soft/60">No products match.</p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((product) => {
                const checked = selected.has(product.id);
                return (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => toggle(product.id)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                        checked ? "border-mahalyred bg-red-50/40" : "border-transparent hover:bg-stone-50"
                      }`}
                    >
                      <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-stone-100">
                        <Image src={product.image} alt="" fill sizes="44px" className="object-cover" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">{product.name}</span>
                        <span className="block truncate text-[11px] text-ink-soft/50">{product.brandName}</span>
                      </span>
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          checked ? "border-mahalyred bg-mahalyred text-white" : "border-stone-200"
                        }`}
                      >
                        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-stone-150 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-md border border-stone-150 px-4 py-2 text-[12.5px] font-semibold text-ink hover:bg-stone-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(Array.from(selected))}
            className="rounded-md bg-ink px-4 py-2 text-[12.5px] font-semibold text-cream"
          >
            Use these products
          </button>
        </div>
      </div>
    </div>
  );
}
