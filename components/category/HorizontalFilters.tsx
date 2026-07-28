"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import type { FilterGroup, Product } from "@/types";
import { parsePriceRangeValue } from "@/lib/filters";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import PriceRangeFilter from "./PriceRangeFilter";

// Product Type only gets highlighted for this specific Main Category
// (taxonomy_nodes Level 1 name), not just any category whose display text
// happens to say "Clothing".
const CLOTHING_CATEGORY = "Clothing";

function FilterOptions({
  group,
  selectedIds,
  onToggle,
}: {
  group: FilterGroup;
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="grid max-h-64 gap-1 overflow-y-auto p-2">
      {group.options.map((option) => {
        const checked = selectedIds.includes(option.id);
        return (
          <button
            type="button"
            key={option.id}
            onClick={() => onToggle(option.id)}
            aria-pressed={checked}
            className="flex min-w-[190px] items-center justify-between rounded-md px-3 py-2 text-left text-[12px] text-ink-soft hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-mahalyred/30"
          >
            <span>{option.label}</span>
            <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? "border-ink bg-ink text-white" : "border-stone-150"}`}>
              {checked && <Check className="h-3 w-3" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function priceButtonLabel(selectedPrice: string[] | undefined): string {
  const range = parsePriceRangeValue(selectedPrice?.[0]);
  if (!range) return "Price";
  return `Price: ${range.min.toLocaleString("en-US")} - ${range.max.toLocaleString("en-US")} EGP`;
}

function buttonLabel(group: FilterGroup, selectedIds: string[]) {
  if (group.id === "price") return priceButtonLabel(selectedIds);
  if (selectedIds.length === 0) return group.title;
  if (selectedIds.length === 1) {
    return `${group.title}: ${group.options.find((option) => option.id === selectedIds[0])?.label ?? selectedIds[0]}`;
  }
  return `${group.title} (${selectedIds.length})`;
}

// Renders the min/max range control for the Price group, or the normal
// checkbox list for everything else.
function GroupBody({
  group,
  products,
  selected,
  onToggle,
  priceBounds,
  onPriceChange,
}: {
  group: FilterGroup;
  products: Product[];
  selected: Record<string, string[]>;
  onToggle: (id: string) => void;
  priceBounds: { min: number; max: number };
  onPriceChange: (min: number, max: number) => void;
}) {
  if (group.id === "price") {
    const range = parsePriceRangeValue(selected.price?.[0]) ?? priceBounds;
    return <PriceRangeFilter bounds={priceBounds} value={range} onChange={onPriceChange} />;
  }
  return <FilterOptions group={group} selectedIds={selected[group.id] ?? []} onToggle={onToggle} />;
}

export default function HorizontalFilters({
  groups,
  products,
  selected,
  onToggle,
  onClear,
  productTypeRelations,
  priceBounds,
  onPriceChange,
}: {
  groups: FilterGroup[];
  products: Product[];
  selected: Record<string, string[]>;
  onToggle: (groupId: string, optionId: string) => void;
  onClear: () => void;
  productTypeRelations?: { mainCategory?: string; productType?: string }[];
  priceBounds: { min: number; max: number };
  onPriceChange: (min: number, max: number) => void;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [fullPanelOpen, setFullPanelOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeCount = Object.values(selected).reduce((sum, ids) => sum + ids.length, 0);
  const selectedCategories = useMemo(
    () => selected.mainCategory ?? [],
    [selected.mainCategory]
  );
  const clothingSelected = selectedCategories.includes(CLOTHING_CATEGORY);

  const relations = useMemo(
    () => productTypeRelations ?? products.map((p) => ({ mainCategory: p.mainCategory, productType: p.productTypeName })),
    [products, productTypeRelations]
  );

  const supportedProductTypes = useMemo(() => {
    if (selectedCategories.length === 0) return [];
    return Array.from(
      new Set(
        relations
          .filter((relation) => relation.mainCategory && selectedCategories.includes(relation.mainCategory))
          .map((relation) => relation.productType)
          .filter((type): type is string => Boolean(type))
      )
    );
  }, [relations, selectedCategories]);

  const productTypeGroup = groups.find((group) => group.id === "productType");
  const contextualProductTypeGroup = productTypeGroup && supportedProductTypes.length > 0
    ? { ...productTypeGroup, options: productTypeGroup.options.filter((option) => supportedProductTypes.includes(option.id)) }
    : null;

  const visibleIds = [
    "mainCategory",
    ...(contextualProductTypeGroup ? ["productType"] : []),
    "size",
    "color",
    "price",
  ];
  const visibleGroups = visibleIds
    .map((id) => id === "productType" ? contextualProductTypeGroup : groups.find((group) => group.id === id))
    .filter((group): group is FilterGroup => Boolean(group));
  const fullPanelIds = [
    "mainCategory",
    "productType",
    "size",
    "color",
    "price",
    "brand",
    "collection",
    "material",
    "fit",
    "availability",
    "rating",
    "featured",
    "audience",
    "discounted",
  ];
  const fullPanelGroups = fullPanelIds
    .map((id) => id === "productType" && contextualProductTypeGroup ? contextualProductTypeGroup : groups.find((group) => group.id === id))
    .filter((group): group is FilterGroup => Boolean(group));

  const handleToggle = (groupId: string, optionId: string) => {
    if (groupId === "mainCategory") {
      const current = selected.mainCategory ?? [];
      const nextCategories = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
      const nextTypes = new Set(
        relations
          .filter((relation) => relation.mainCategory && nextCategories.includes(relation.mainCategory))
          .map((relation) => relation.productType)
          .filter((type): type is string => Boolean(type))
      );
      (selected.productType ?? []).forEach((type) => {
        if (!nextTypes.has(type)) onToggle("productType", type);
      });
    }
    onToggle(groupId, optionId);
  };

  const closeAll = () => {
    setMobileOpen(false);
    setFullPanelOpen(false);
    setOpenGroup(null);
  };

  useEffect(() => {
    if (!mobileOpen && !fullPanelOpen && !openGroup) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeAll();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [mobileOpen, fullPanelOpen, openGroup]);

  // One shared outside-click listener for the whole desktop filter row —
  // covers both the "All filters" mega panel and any single open group
  // popover, since only one of those is ever open at a time.
  const rowRef = useClickOutside<HTMLDivElement>(fullPanelOpen || openGroup !== null, () => {
    setFullPanelOpen(false);
    setOpenGroup(null);
  });

  return (
    <>
      <div ref={rowRef} className="flex min-w-0 items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              if (window.matchMedia("(min-width: 1024px)").matches) {
                setFullPanelOpen((open) => !open);
                setOpenGroup(null);
              } else {
                setMobileOpen(true);
              }
            }}
            aria-expanded={fullPanelOpen || mobileOpen}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-stone-150 bg-white px-4 text-[12px] font-medium"
          >
            <span className="lg:hidden">Filters</span><span className="hidden lg:inline">Filter</span>
            <SlidersHorizontal className="h-4 w-4" />
            {activeCount > 0 && <span className="rounded-full bg-mahalyred px-1.5 py-0.5 text-[9px] text-white">{activeCount}</span>}
          </button>

          {fullPanelOpen && (
            <div role="dialog" aria-label="All product filters" className="absolute left-0 top-11 z-50 hidden w-[560px] rounded-xl border border-stone-150 bg-[#eeece8] p-4 shadow-card lg:block">
              <div className="mb-3 flex items-center justify-between">
                <div><h3 className="text-sm font-semibold">All filters</h3><p className="mt-0.5 text-[11px] text-ink-soft/55">{activeCount} active</p></div>
                <div className="flex items-center gap-3">{activeCount > 0 && <button type="button" onClick={onClear} className="text-[11px] font-semibold text-mahalyred">Clear all</button>}<button type="button" onClick={() => setFullPanelOpen(false)} aria-label="Close all filters" className="rounded-full border border-stone-150 p-1.5"><X className="h-3.5 w-3.5" /></button></div>
              </div>
              <div className="grid max-h-[420px] grid-cols-2 content-start items-start gap-3 overflow-y-auto">
                {fullPanelGroups.map((group) => {
                  const isProductType = group.id === "productType";
                  return (
                    <details
                      key={group.id}
                      className={`group self-start rounded-lg border bg-white open:shadow-soft ${isProductType && clothingSelected ? "border-amber-300 bg-amber-50 transition-colors motion-reduce:transition-none" : "border-stone-150"}`}
                    >
                      <summary className="flex h-10 cursor-pointer list-none items-center justify-between px-3 text-[12px] font-semibold focus:outline-none focus:ring-2 focus:ring-inset focus:ring-mahalyred/30">
                        <span>{buttonLabel(group, selected[group.id] ?? [])}</span>
                        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="border-t border-stone-150">
                        <GroupBody group={group} products={products} selected={selected} onToggle={(id) => handleToggle(group.id, id)} priceBounds={priceBounds} onPriceChange={onPriceChange} />
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          {visibleGroups.map((group) => {
            const isProductType = group.id === "productType";
            return (
              <div key={group.id} className="relative">
                <button
                  type="button"
                  onClick={() => { setOpenGroup(openGroup === group.id ? null : group.id); setFullPanelOpen(false); }}
                  aria-expanded={openGroup === group.id}
                  className={`inline-flex h-9 max-w-[210px] items-center gap-3 rounded-full border bg-white px-4 text-[12px] font-medium transition-colors motion-reduce:transition-none ${isProductType && clothingSelected ? "border-amber-300 bg-amber-50" : "border-stone-150"}`}
                >
                  <span className="truncate">{buttonLabel(group, selected[group.id] ?? [])}</span><ChevronDown className="h-3.5 w-3.5 shrink-0" />
                </button>
                {openGroup === group.id && (
                  <div className="absolute left-0 top-11 z-50 rounded-xl border border-stone-150 bg-white shadow-card">
                    <GroupBody group={group} products={products} selected={selected} onToggle={(id) => handleToggle(group.id, id)} priceBounds={priceBounds} onPriceChange={onPriceChange} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button aria-label="Close filters" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-black/30" />
          <aside role="dialog" aria-modal="true" aria-label="Product filters" className="absolute bottom-0 left-0 right-0 max-h-[86vh] overflow-y-auto rounded-t-3xl bg-white p-6 shadow-card">
            <div className="mb-5 flex items-center justify-between"><div><h2 className="font-serif text-2xl font-semibold">Filters</h2><p className="mt-1 text-xs text-ink-soft/55">{activeCount} active</p></div><button onClick={() => setMobileOpen(false)} aria-label="Close filters" className="rounded-full border border-stone-150 p-2"><X className="h-4 w-4" /></button></div>
            <div className="pb-20">
              {groups.map((group) => {
                const isProductType = group.id === "productType";
                return (
                  <details
                    key={group.id}
                    className={`border-b py-3 ${isProductType && clothingSelected ? "border-amber-300 bg-amber-50 transition-colors motion-reduce:transition-none" : "border-stone-150"}`}
                  >
                    <summary className="cursor-pointer list-none text-sm font-semibold">{group.title}</summary>
                    <GroupBody group={group} products={products} selected={selected} onToggle={(id) => handleToggle(group.id, id)} priceBounds={priceBounds} onPriceChange={onPriceChange} />
                  </details>
                );
              })}
            </div>
            <div className="sticky bottom-0 mt-5 flex gap-3 bg-white pt-3"><button onClick={onClear} className="flex-1 rounded-lg border border-stone-150 py-3 text-sm font-semibold">Clear all</button><button onClick={() => setMobileOpen(false)} className="flex-1 rounded-lg bg-mahalyred py-3 text-sm font-semibold text-white">Show products</button></div>
          </aside>
        </div>
      )}
    </>
  );
}
