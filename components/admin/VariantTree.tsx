"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import type { OptionValueOption, VariantRow } from "./InventoryVariantsSection";
import ColorSwatch from "./ColorSwatch";
import { calculateStockStatus, effectiveLowStockThreshold } from "@/lib/inventory/stockStatus";

type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";
type StatusFilter = "all" | "draft" | "published";

function formatDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Read-only view of every persisted/draft Variant, grouped by Color. This
// is not a second editing surface — it exists for review, search, and
// navigating back to the Matrix cell that owns a given Variant.
export default function VariantTree({
  colorValues,
  sizeValues,
  variants,
  colorImages,
  defaultLowStockThreshold,
  productPublished,
  productSkuPreview,
  onLocateCell,
}: {
  colorValues: OptionValueOption[];
  sizeValues: OptionValueOption[];
  variants: VariantRow[];
  colorImages: Record<string, string>;
  defaultLowStockThreshold: number;
  productPublished: boolean;
  productSkuPreview: string;
  onLocateCell?: (colorId: string, sizeId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const sizeById = useMemo(() => new Map(sizeValues.map((s) => [s.id, s])), [sizeValues]);

  const rows = useMemo(() => {
    return variants
      .map((variant) => {
        const colorId = colorValues.find((c) => variant.optionValueIds.includes(c.id))?.id;
        const sizeId = variant.optionValueIds.find((id) => sizeById.has(id));
        if (!colorId || !sizeId) return null;
        const size = sizeById.get(sizeId)!;
        const threshold = effectiveLowStockThreshold(variant.lowStockThresholdOverride, defaultLowStockThreshold);
        const stockStatus = calculateStockStatus(variant.quantity, threshold);
        const state = !variant.id ? "draft" : productPublished ? "published" : "draft";
        return { variant, colorId, sizeId, size, stockStatus, state };
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
  }, [variants, colorValues, sizeById, defaultLowStockThreshold, productPublished]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const row of rows) {
      const q = search.trim().toLowerCase();
      const color = colorValues.find((c) => c.id === row.colorId);
      if (q) {
        const haystack = `${row.variant.sku ?? ""} ${color?.label ?? ""} ${row.size.label}`.toLowerCase();
        if (!haystack.includes(q)) continue;
      }
      if (stockFilter !== "all" && row.stockStatus !== stockFilter) continue;
      if (statusFilter !== "all" && row.state !== statusFilter) continue;
      map.set(row.colorId, [...(map.get(row.colorId) ?? []), row]);
    }
    return map;
  }, [rows, colorValues, search, stockFilter, statusFilter]);

  const toggle = (colorId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(colorId)) next.delete(colorId);
      else next.add(colorId);
      return next;
    });
  };

  if (variants.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-ink">All Variants</h3>
        <p className="text-[11.5px] text-ink-soft/50">
          Variant SKU namespace: <code>{productSkuPreview}</code>
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU, color, or size"
            aria-label="Search variants"
            className="rounded-md border border-stone-150 py-1.5 pl-8 pr-3 text-[12.5px] outline-none focus:border-ink/30"
          />
        </div>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-md border border-stone-150 px-2 py-1.5 text-[12px]"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
        <select
          aria-label="Filter by stock"
          value={stockFilter}
          onChange={(e) => setStockFilter(e.target.value as StockFilter)}
          className="rounded-md border border-stone-150 px-2 py-1.5 text-[12px]"
        >
          <option value="all">All stock levels</option>
          <option value="in_stock">In Stock</option>
          <option value="low_stock">Low Stock</option>
          <option value="out_of_stock">Out of Stock</option>
        </select>
        <button type="button" onClick={() => setCollapsed(new Set())} className="text-[12px] font-semibold text-ink-soft/60 hover:underline">
          Expand All
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(new Set(colorValues.map((c) => c.id)))}
          className="text-[12px] font-semibold text-ink-soft/60 hover:underline"
        >
          Collapse All
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {[...grouped.entries()].map(([colorId, colorRows]) => {
          const color = colorValues.find((c) => c.id === colorId);
          const isCollapsed = collapsed.has(colorId);
          return (
            <div key={colorId} className="rounded-lg border border-stone-150">
              <button
                type="button"
                onClick={() => toggle(colorId)}
                aria-expanded={!isCollapsed}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
              >
                {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-ink-soft/40" /> : <ChevronDown className="h-3.5 w-3.5 text-ink-soft/40" />}
                <ColorSwatch swatchType={color?.swatchType} primaryColor={color?.primaryColor} secondaryColor={color?.secondaryColor} size={18} />
                {colorImages[colorId] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={colorImages[colorId]} alt="" className="h-6 w-6 rounded object-cover" />
                )}
                <span className="text-[13px] font-semibold text-ink">{color?.label ?? "—"}</span>
                <span className="ml-auto text-[11.5px] text-ink-soft/50">{colorRows.length} variant{colorRows.length === 1 ? "" : "s"}</span>
              </button>
              {!isCollapsed && (
                <div className="overflow-x-auto border-t border-stone-150">
                  <table className="w-full text-left text-[12.5px]">
                    <thead className="border-b border-stone-150 bg-stone-50 text-[10.5px] uppercase tracking-wide text-ink-soft/50">
                      <tr>
                        <th className="px-3 py-2 font-medium">Size</th>
                        <th className="px-3 py-2 font-medium">SKU</th>
                        <th className="px-3 py-2 font-medium">Stock</th>
                        <th className="px-3 py-2 font-medium">Price</th>
                        <th className="px-3 py-2 font-medium">State</th>
                        <th className="px-3 py-2 font-medium">Stock Status</th>
                        <th className="px-3 py-2 font-medium">Last Updated</th>
                        <th className="px-3 py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-150">
                      {colorRows.map((row) => (
                        <tr key={`${row.colorId}-${row.sizeId}`}>
                          <td className="px-3 py-2 font-medium text-ink">{row.size.label}</td>
                          <td className="px-3 py-2"><code className="text-[11.5px]">{row.variant.sku ?? "—"}</code></td>
                          <td className="px-3 py-2">{row.variant.quantity}</td>
                          <td className="px-3 py-2">{row.variant.variantPrice != null ? row.variant.variantPrice : "Base price"}</td>
                          <td className="px-3 py-2 capitalize">{row.state}</td>
                          <td className="px-3 py-2 capitalize">{row.stockStatus.replace("_", " ")}</td>
                          <td className="px-3 py-2 text-ink-soft/60">{formatDate(row.variant.updatedAt)}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => onLocateCell?.(row.colorId, row.sizeId)}
                              className="text-[11.5px] font-semibold text-ink underline"
                            >
                              View / Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {grouped.size === 0 && (
          <p className="rounded-md border border-stone-150 px-3.5 py-3 text-[12.5px] text-ink-soft/50">No variants match these filters.</p>
        )}
      </div>
    </div>
  );
}
