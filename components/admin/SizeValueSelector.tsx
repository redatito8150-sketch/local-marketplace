"use client";

import { useMemo, useState } from "react";
import type { TaxonomyNode } from "@/types";
import type { OptionValueOption } from "./InventoryVariantsSection";
import { profileForSizeLabel, recommendedSizeProfiles, SIZE_PROFILE_NAMES } from "@/lib/inventory/sizeProfiles";

export default function SizeValueSelector({
  options, selectedIds, taxonomyNodes, productTypeId, onToggle, onCreate, disabled,
}: {
  options: OptionValueOption[];
  selectedIds: string[];
  taxonomyNodes: TaxonomyNode[];
  productTypeId: string;
  onToggle: (id: string) => void;
  onCreate: (label: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [browse, setBrowse] = useState(false);
  const [search, setSearch] = useState("");
  const [custom, setCustom] = useState("");
  const recommended = useMemo(() => new Set(recommendedSizeProfiles(taxonomyNodes, productTypeId)), [taxonomyNodes, productTypeId]);
  const annotated = options.map((option) => ({
    ...option,
    profile: option.brandId ? "custom-only" as const : profileForSizeLabel(option.label),
  }));
  const selectedOutside = annotated.some((option) => selectedIds.includes(option.id) && !option.brandId && !recommended.has(option.profile));
  const visible = search.trim()
    ? annotated.filter((option) => option.label.toLowerCase().includes(search.trim().toLowerCase()))
    : annotated.filter((option) => option.brandId || recommended.has(option.profile) || browse);
  const grouped = new Map<string, typeof visible>();
  for (const option of visible) {
    const group = option.brandId ? "Your custom sizes" : `${SIZE_PROFILE_NAMES[option.profile]}${recommended.has(option.profile) ? " — Recommended" : ""}`;
    grouped.set(group, [...(grouped.get(group) ?? []), option]);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label className="text-[12.5px] font-semibold text-ink">Size</label>
        <input aria-label="Search sizes" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sizes" className="w-40 rounded border border-stone-150 px-2 py-1 text-[12px]" />
      </div>
      {selectedOutside && <p className="mt-2 rounded bg-amber-50 p-2 text-[11.5px] text-amber-800">Some selected sizes are outside the recommended sizes for this Product Type. They will remain selected until you remove or replace them.</p>}
      <div className="mt-2 space-y-3">
        {[...grouped].map(([group, values]) => (
          <div key={group}>
            <p className="mb-1 text-[11px] font-semibold text-ink-soft/55">{group}</p>
            <div className="flex flex-wrap gap-1.5">
              {values.map((option) => <button key={option.id} type="button" disabled={disabled || option.isArchived} aria-pressed={selectedIds.includes(option.id)} onClick={() => onToggle(option.id)} className={`rounded border px-2.5 py-1.5 text-[12px] ${selectedIds.includes(option.id) ? "border-ink bg-ink text-cream" : "border-stone-150"}`}>{option.label}</button>)}
            </div>
          </div>
        ))}
      </div>
      {!search && <button type="button" onClick={() => setBrowse((value) => !value)} className="mt-2 text-[12px] font-semibold underline">{browse ? "Hide other size groups" : "Browse other size groups"}</button>}
      <form className="mt-3 flex gap-2" onSubmit={async (event) => { event.preventDefault(); if (!custom.trim()) return; await onCreate(custom.trim()); setCustom(""); }}>
        <input value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="Create custom value" className="rounded border border-stone-150 px-2 py-1.5 text-[12px]" />
        <button type="submit" disabled={disabled || !custom.trim()} className="rounded border px-2 py-1.5 text-[12px] font-semibold">Create</button>
      </form>
    </div>
  );
}
