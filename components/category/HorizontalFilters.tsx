"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import type { FilterGroup } from "@/types";

function FilterOptions({ group, selectedIds, onToggle }: { group: FilterGroup; selectedIds: string[]; onToggle: (id: string) => void }) {
  return <div className="grid max-h-64 gap-1 overflow-y-auto p-2">{group.options.map((option) => {
    const checked = selectedIds.includes(option.id);
    return <button type="button" key={option.id} onClick={() => onToggle(option.id)} className="flex min-w-[190px] items-center justify-between rounded-md px-3 py-2 text-left text-[12px] text-ink-soft hover:bg-stone-50"><span>{option.label}</span><span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? "border-ink bg-ink text-white" : "border-stone-150"}`}>{checked && <Check className="h-3 w-3" />}</span></button>;
  })}</div>;
}

export default function HorizontalFilters({ groups, selected, onToggle, onClear }: { groups: FilterGroup[]; selected: Record<string, string[]>; onToggle: (groupId: string, optionId: string) => void; onClear: () => void }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeCount = Object.values(selected).reduce((sum, ids) => sum + ids.length, 0);
  const preferred = ["productCategory", "size", "color", "price", "brand", "availability"];
  const desktopGroups = preferred.map((id) => groups.find((group) => group.id === id)).filter((group): group is FilterGroup => Boolean(group));

  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [mobileOpen]);

  return (
    <>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setMobileOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-full border border-stone-150 bg-white px-4 text-[12px] font-medium"><span className="lg:hidden">Filters</span><span className="hidden lg:inline">Filter</span><SlidersHorizontal className="h-4 w-4" />{activeCount > 0 && <span className="rounded-full bg-mahalyred px-1.5 py-0.5 text-[9px] text-white">{activeCount}</span>}</button>
        <div className="hidden items-center gap-2 lg:flex">
          {desktopGroups.slice(0, 4).map((group) => <div key={group.id} className="relative"><button type="button" onClick={() => setOpenGroup(openGroup === group.id ? null : group.id)} aria-expanded={openGroup === group.id} className="inline-flex h-9 items-center gap-3 rounded-full border border-stone-150 bg-white px-4 text-[12px] font-medium">{group.title}<ChevronDown className="h-3.5 w-3.5" /></button>{openGroup === group.id && <div className="absolute left-0 top-11 z-50 rounded-xl border border-stone-150 bg-white shadow-card"><FilterOptions group={group} selectedIds={selected[group.id] ?? []} onToggle={(id) => onToggle(group.id, id)} /></div>}</div>)}
          {activeCount > 0 && <button type="button" onClick={onClear} className="px-2 text-[11px] font-medium text-mahalyred">Clear all</button>}
        </div>
      </div>

      {mobileOpen && <div className="fixed inset-0 z-[70] lg:hidden"><button aria-label="Close filters" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-black/30" /><aside role="dialog" aria-modal="true" aria-label="Product filters" className="absolute bottom-0 left-0 right-0 max-h-[86vh] overflow-y-auto rounded-t-3xl bg-white p-6 shadow-card"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-serif text-2xl font-semibold">Filters</h2><p className="mt-1 text-xs text-ink-soft/55">{activeCount} active</p></div><button onClick={() => setMobileOpen(false)} aria-label="Close filters" className="rounded-full border border-stone-150 p-2"><X className="h-4 w-4" /></button></div>{groups.map((group) => <details key={group.id} className="border-b border-stone-150 py-3"><summary className="cursor-pointer list-none text-sm font-semibold">{group.title}</summary><FilterOptions group={group} selectedIds={selected[group.id] ?? []} onToggle={(id) => onToggle(group.id, id)} /></details>)}<div className="sticky bottom-0 mt-5 flex gap-3 bg-white pt-3"><button onClick={onClear} className="flex-1 rounded-lg border border-stone-150 py-3 text-sm font-semibold">Clear all</button><button onClick={() => setMobileOpen(false)} className="flex-1 rounded-lg bg-mahalyred py-3 text-sm font-semibold text-white">Show products</button></div></aside></div>}
    </>
  );
}
