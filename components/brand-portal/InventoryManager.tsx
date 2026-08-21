"use client";

import Image from "next/image";
import { Fragment, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronRight, ClipboardList, Download, PackagePlus, RotateCcw, X } from "lucide-react";
import type { BrandVariant, InventoryMovement } from "@/lib/data/brandPortal";
import { INVENTORY_REASONS, type InventoryAdjustmentType } from "@/lib/inventory/adjustmentValidation";
import { formatDateTime } from "@/lib/format";
import { DashboardFilterField, DashboardMoreFilters, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import ColorSwatch from "@/components/admin/ColorSwatch";
import { compareSizeOrderables } from "@/lib/inventory/sizeOrder";
import { ReturnRequestDrawer } from "@/components/brand-portal/warehouse/WarehouseExperience";
import type { WarehouseVariantRow } from "@/lib/data/warehouse";

type InventoryView = "inventory" | "activity";
type LocalSort = `${string}-asc` | `${string}-desc`;

const fieldClass = "mt-1.5 h-10 w-full rounded-xl border border-[#e4d9d1] bg-white px-3 text-[12px] text-[#4d433c] outline-none focus-visible:border-[#C85956]/50 focus-visible:ring-4 focus-visible:ring-[#C85956]/8";

function InventorySortHeader({ field, label, sort, onSort, className = "" }: { field: string; label: string; sort: LocalSort; onSort: (field: string) => void; className?: string }) {
  const active = sort.startsWith(`${field}-`);
  const Icon = active ? sort.endsWith("-asc") ? ArrowUp : ArrowDown : ArrowUpDown;
  return <th className={className}><button type="button" onClick={() => onSort(field)} aria-label={`Sort by ${label}${active ? sort.endsWith("-asc") ? ", ascending" : ", descending" : ""}`} className={`group inline-flex min-h-8 items-center gap-1.5 rounded-lg px-1.5 text-left outline-none transition-colors hover:text-[#C85956] focus-visible:ring-2 focus-visible:ring-[#C85956]/25 ${active ? "text-[#C85956]" : ""}`}><span>{label}</span><Icon aria-hidden="true" className={`h-3 w-3 ${active ? "opacity-100" : "opacity-45 group-hover:opacity-100"}`} /></button></th>;
}

function toggleLocalSort(current: LocalSort, field: string, defaultDirection: "asc" | "desc" = "asc"): LocalSort {
  if (current === `${field}-asc`) return `${field}-desc`;
  if (current === `${field}-desc`) return `${field}-asc`;
  return `${field}-${defaultDirection}`;
}

function localDateTimeValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function statusMeta(status: BrandVariant["stockStatus"]) {
  if (status === "out_of_stock") return { label: "Out of stock", badge: "bg-red-50 text-red-700", dot: "bg-red-500" };
  if (status === "low_stock") return { label: "Low stock", badge: "bg-amber-50 text-amber-800", dot: "bg-amber-500" };
  return { label: "Healthy", badge: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" };
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    order: "Customer order",
    order_cancellation: "Cancelled order",
    brand_portal: "Brand adjustment",
    product_editor: "Product setup",
    warehouse_transfer: "Warehouse transfer",
  };
  return labels[source] ?? source.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function activityCsv(history: InventoryMovement[], variants: Map<string, BrandVariant>) {
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = history.map((movement) => {
    const variant = variants.get(movement.variantId);
    return [movement.createdAt, variant?.productName ?? "Archived product", variant?.sku ?? movement.variantId, movement.quantityDelta, movement.previousQuantity, movement.newQuantity, movement.reason, movement.note ?? "", sourceLabel(movement.source)].map(escape).join(",");
  });
  return [`Date,Product,SKU,Movement,Before,After,Reason,Note,Source`, ...rows].join("\r\n");
}

function VariantImage({ image, alt }: { image: string; alt: string }) {
  return <div className="relative h-14 w-12 flex-none overflow-hidden rounded-xl bg-[#f3ede7]">{image ? <Image src={image} alt={alt} fill sizes="48px" className="object-cover" /> : <div className="flex h-full items-center justify-center text-[#b2a49a]"><PackagePlus aria-hidden="true" className="h-4 w-4" /></div>}</div>;
}

function SelectedVariantChips({ variants, onRemove }: { variants: BrandVariant[]; onRemove: (variantId: string) => void }) {
  return <div className="border-t border-[#eee7e1] px-4 py-2.5">
    <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
      {variants.map((variant) => <div key={variant.variantId} className="flex min-w-fit items-center gap-2 rounded-xl bg-[#f4eee9] py-1.5 pl-2.5 pr-1.5 text-[#51473f]">
        <span className="max-w-48 truncate text-[9.5px] font-bold">{variant.color || "No color"} · {variant.size || "One size"}</span>
        <button
          type="button"
          aria-label={`Remove ${variant.sku} from selection`}
          title="Remove from selection"
          onClick={() => onRemove(variant.variantId)}
          className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-lg text-[#8d8076] transition-colors hover:bg-white hover:text-[#C85956] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>)}
    </div>
  </div>;
}

type ColorVariantGroup = {
  key: string;
  label: string;
  variants: BrandVariant[];
};

type ProductVariantGroup = {
  productId: string;
  productName: string;
  // The product's own designated cover photo — every variant of the same
  // product carries the identical BrandVariant.productImage value, so the
  // first one is as good as any. Kept separate from `variants[0].image`
  // (that variant's own color photo), which is what the expanded per-color
  // rows below the collapsed product row use instead.
  productImage: string;
  variants: BrandVariant[];
  colors: ColorVariantGroup[];
};

function buildVariantGroups(variants: BrandVariant[]): ProductVariantGroup[] {
  const products = new Map<string, { productName: string; productImage: string; variants: BrandVariant[]; colors: Map<string, ColorVariantGroup> }>();

  for (const variant of variants) {
    const product = products.get(variant.productId) ?? {
      productName: variant.productName,
      productImage: variant.productImage,
      variants: [],
      colors: new Map<string, ColorVariantGroup>(),
    };
    product.variants.push(variant);

    const colorLabel = variant.color?.trim() || "No color";
    const colorKey = `${variant.productId}:${colorLabel.toLocaleLowerCase()}`;
    const color = product.colors.get(colorKey) ?? { key: colorKey, label: colorLabel, variants: [] };
    color.variants.push(variant);
    product.colors.set(colorKey, color);
    products.set(variant.productId, product);
  }

  return [...products.entries()].map(([productId, product]) => ({
    productId,
    productName: product.productName,
    productImage: product.productImage,
    variants: product.variants,
    colors: [...product.colors.values()].map((color) => ({
      ...color,
      variants: [...color.variants].sort((first, second) => compareSizeOrderables(
        { id: first.variantId, label: first.size ?? "One size", sortOrder: first.sizeSortOrder, brandId: first.sizeBrandId },
        { id: second.variantId, label: second.size ?? "One size", sortOrder: second.sizeSortOrder, brandId: second.sizeBrandId },
      )),
    })),
  }));
}

function stockGroupSummary(variants: BrandVariant[]) {
  const issueCount = variants.filter((variant) => variant.stockStatus !== "in_stock").length;
  const worstStatus: BrandVariant["stockStatus"] = variants.some((variant) => variant.stockStatus === "out_of_stock")
    ? "out_of_stock"
    : variants.some((variant) => variant.stockStatus === "low_stock")
      ? "low_stock"
      : "in_stock";
  return {
    available: variants.reduce((sum, variant) => sum + variant.quantity, 0),
    incoming: variants.reduce((sum, variant) => sum + variant.incomingQuantity, 0),
    ordered: variants.reduce((sum, variant) => sum + variant.soldLast30Days, 0),
    issueCount,
    status: statusMeta(worstStatus),
  };
}

function VariantStockHierarchy({ variants, selected, canSelect, isMahalyPartner, onToggleVariant, onToggleVariants }: {
  variants: BrandVariant[];
  selected: string[];
  canSelect: boolean;
  isMahalyPartner: boolean;
  onToggleVariant: (variantId: string, checked: boolean) => void;
  onToggleVariants: (variantIds: string[], checked: boolean) => void;
}) {
  const [sort, setSort] = useState<LocalSort>("product-asc");
  const groups = useMemo(() => buildVariantGroups(variants).sort((first, second) => {
    const direction = sort.endsWith("-desc") ? -1 : 1;
    const firstSummary = stockGroupSummary(first.variants);
    const secondSummary = stockGroupSummary(second.variants);
    if (sort.startsWith("product-")) return direction * first.productName.localeCompare(second.productName);
    if (sort.startsWith("available-")) return direction * (firstSummary.available - secondSummary.available);
    if (sort.startsWith("incoming-")) return direction * (firstSummary.incoming - secondSummary.incoming);
    if (sort.startsWith("ordered-")) return direction * (firstSummary.ordered - secondSummary.ordered);
    if (sort.startsWith("status-")) return direction * (firstSummary.issueCount - secondSummary.issueCount);
    return 0;
  }), [sort, variants]);
  const [expandedProducts, setExpandedProducts] = useState<string[]>([]);
  const [expandedColors, setExpandedColors] = useState<string[]>([]);
  const isSelected = (items: BrandVariant[]) => items.every((variant) => selected.includes(variant.variantId));

  function openProduct(group: ProductVariantGroup) {
    const open = expandedProducts.includes(group.productId);
    setExpandedProducts((current) => open ? current.filter((id) => id !== group.productId) : [...current, group.productId]);
  }

  function openColor(group: ColorVariantGroup) {
    const open = expandedColors.includes(group.key);
    setExpandedColors((current) => open ? current.filter((key) => key !== group.key) : [...current, group.key]);
  }

  return <>
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[920px] table-fixed text-left text-[12px]">
        <colgroup>
          {canSelect && <col style={{ width: "4%" }} />}
          <col style={{ width: isMahalyPartner ? canSelect ? "32%" : "36%" : canSelect ? "40%" : "44%" }} />
          <col style={{ width: isMahalyPartner ? "14%" : "18%" }} />
          {isMahalyPartner && <col style={{ width: "14%" }} />}
          <col style={{ width: isMahalyPartner ? "14%" : "18%" }} />
          <col style={{ width: isMahalyPartner ? "22%" : "20%" }} />
        </colgroup>
        <thead className="border-b border-[#eeece9] bg-white text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8d8076]"><tr>{canSelect && <th className="w-12 px-5 py-3"><input aria-label="Select all visible variants" type="checkbox" className="h-4 w-4 accent-[#C85956]" checked={selected.length === variants.length && variants.length > 0} onChange={(event) => onToggleVariants(variants.map((variant) => variant.variantId), event.target.checked)} /></th>}<InventorySortHeader field="product" label="Product / variant" sort={sort} onSort={(field) => setSort((current) => toggleLocalSort(current, field))} className={!canSelect ? "pl-5" : undefined} /><InventorySortHeader field="available" label="Available" sort={sort} onSort={(field) => setSort((current) => toggleLocalSort(current, field, "desc"))} className="text-center" />{isMahalyPartner && <InventorySortHeader field="incoming" label="Incoming" sort={sort} onSort={(field) => setSort((current) => toggleLocalSort(current, field, "desc"))} className="text-center" />}<InventorySortHeader field="ordered" label="Ordered 30d" sort={sort} onSort={(field) => setSort((current) => toggleLocalSort(current, field, "desc"))} className="text-center" /><InventorySortHeader field="status" label="Status" sort={sort} onSort={(field) => setSort((current) => toggleLocalSort(current, field, "desc"))} className="pr-5 text-center" /></tr></thead>
        {groups.map((product) => {
          const productOpen = expandedProducts.includes(product.productId);
          const productSummary = stockGroupSummary(product.variants);
          return <tbody key={product.productId} className="border-b border-[#eeece9] last:border-b-0">
            <tr className={isSelected(product.variants) ? "bg-[#fff7f5]" : "bg-white"}>
              {canSelect && <td className="px-5 py-3"><input aria-label={`Select all variants of ${product.productName}`} type="checkbox" className="h-4 w-4 accent-[#C85956]" checked={isSelected(product.variants)} onChange={(event) => onToggleVariants(product.variants.map((variant) => variant.variantId), event.target.checked)} /></td>}
              <td className={`py-3 ${!canSelect ? "pl-5" : ""}`}><button type="button" aria-expanded={productOpen} onClick={() => openProduct(product)} className="group flex w-full min-w-0 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25"><span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-[#8d8076] transition-colors group-hover:bg-white group-hover:text-[#C85956]">{productOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span><VariantImage image={product.productImage} alt={product.productName} /><span className="min-w-0"><span className="block truncate text-[12px] font-extrabold text-[#302924]">{product.productName}</span><span className="mt-1 block text-[9.5px] font-medium text-[#8d8076]">{product.variants.length} {product.variants.length === 1 ? "variant" : "variants"} · {product.colors.length} {product.colors.length === 1 ? "color" : "colors"}</span></span></button></td>
              <AggregateCell value={productSummary.available} /><>{isMahalyPartner && <AggregateCell value={productSummary.incoming} accent={productSummary.incoming > 0} />}</><AggregateCell value={productSummary.ordered} /><GroupStatus summary={productSummary} className="pr-5" />
            </tr>
            {productOpen && product.colors.map((color) => {
              const colorOpen = expandedColors.includes(color.key);
              const colorSummary = stockGroupSummary(color.variants);
              return <Fragment key={color.key}>
                <tr className={isSelected(color.variants) ? "bg-[#fffaf7]" : "bg-white"}>
                  {canSelect && <td className="px-5 py-2.5 pl-8"><input aria-label={`Select ${color.label} variants of ${product.productName}`} type="checkbox" className="h-4 w-4 accent-[#C85956]" checked={isSelected(color.variants)} onChange={(event) => onToggleVariants(color.variants.map((variant) => variant.variantId), event.target.checked)} /></td>}
                  <td className={`py-2.5 ${!canSelect ? "pl-10" : ""}`}><button type="button" aria-expanded={colorOpen} onClick={() => openColor(color)} className="group flex w-full min-w-0 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25"><span className="ml-3 flex h-7 w-7 flex-none items-center justify-center rounded-lg text-[#9b8e84] group-hover:text-[#C85956]">{colorOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</span><VariantImage image={color.variants[0].image} alt={`${product.productName} in ${color.label}`} /><span className="min-w-0"><span className="block truncate font-bold text-[#4d433c]">{color.label}</span><span className="mt-1 inline-flex rounded-md bg-[#f1ebe5] px-2 py-0.5 text-[8.5px] font-bold text-[#81746b]">{color.variants.length} {color.variants.length === 1 ? "size" : "sizes"}</span></span></button></td>
                  <AggregateCell value={colorSummary.available} /><>{isMahalyPartner && <AggregateCell value={colorSummary.incoming} accent={colorSummary.incoming > 0} />}</><AggregateCell value={colorSummary.ordered} /><GroupStatus summary={colorSummary} className="pr-5" />
                </tr>
                {colorOpen && color.variants.map((variant, variantIndex) => {
                  const status = statusMeta(variant.stockStatus);
                  const checked = selected.includes(variant.variantId);
                  const closesColorGroup = variantIndex === color.variants.length - 1;
                  return <tr key={variant.variantId} className={`border-t border-[#f1efec] transition-colors ${closesColorGroup ? "border-b-2 border-b-[#e3dfdb]" : ""} ${checked ? "bg-[#fff7f5]" : "bg-white hover:bg-[#faf9f8]"}`}>
                    {canSelect && <td className="px-5 py-2.5 pl-12"><input aria-label={`Select ${variant.sku}`} type="checkbox" className="h-4 w-4 accent-[#C85956]" checked={checked} onChange={(event) => onToggleVariant(variant.variantId, event.target.checked)} /></td>}
                    <td className={`py-2.5 ${!canSelect ? "pl-16" : ""}`}><div className="ml-12 min-w-0"><div className="flex items-center gap-1.5"><span title={variant.color ?? "Default color"}><ColorSwatch swatchType={variant.swatchType} primaryColor={variant.primaryColor} secondaryColor={variant.secondaryColor} size={12} /></span><p className="font-bold text-[#51473f]">{variant.size || "One size"}</p></div><code className="mt-1 block max-w-[280px] truncate text-[8.5px] text-[#94867c]">{variant.sku}</code></div></td>
                    <AggregateCell value={variant.quantity} /><>{isMahalyPartner && <AggregateCell value={variant.incomingQuantity} accent={variant.incomingQuantity > 0} />}</><AggregateCell value={variant.soldLast30Days} /><td className="pr-5 text-center"><span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9.5px] font-bold ${status.badge}`}><span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />{status.label}</span>{variant.suggestedRestock > 0 && <p className="mt-1 text-[9px] font-bold text-[#C85956]">Suggested +{variant.suggestedRestock}</p>}</td>
                  </tr>;
                })}
              </Fragment>;
            })}
          </tbody>;
        })}
      </table>
    </div>

    <div className="divide-y divide-[#e8dfd8] md:hidden">{groups.map((product) => {
      const productOpen = expandedProducts.includes(product.productId);
      const productSummary = stockGroupSummary(product.variants);
      return <article key={product.productId} className={isSelected(product.variants) ? "bg-[#fff7f5]" : "bg-white"}>
        <div className="flex items-center gap-3 p-4">{canSelect && <input aria-label={`Select all variants of ${product.productName}`} type="checkbox" className="h-5 w-5 flex-none accent-[#C85956]" checked={isSelected(product.variants)} onChange={(event) => onToggleVariants(product.variants.map((variant) => variant.variantId), event.target.checked)} />}<button type="button" aria-expanded={productOpen} onClick={() => openProduct(product)} className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25">{productOpen ? <ChevronDown className="h-4 w-4 flex-none text-[#C85956]" /> : <ChevronRight className="h-4 w-4 flex-none text-[#8d8076]" />}<VariantImage image={product.productImage} alt={product.productName} /><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-extrabold text-[#302924]">{product.productName}</span><span className="mt-1 block text-[9.5px] text-[#8d8076]">{product.variants.length} variants · {productSummary.available} available{isMahalyPartner ? ` · ${productSummary.incoming} incoming` : ""}</span></span></button></div>
        {productOpen && <div className="border-t border-[#eeece9] bg-white px-3 py-2"><div aria-hidden="true" className="mx-auto mb-2 h-px w-[72%] bg-[#e3dfdb]" />{product.colors.map((color) => {
          const colorOpen = expandedColors.includes(color.key);
          return <div key={color.key} className="my-2 overflow-hidden rounded-xl border border-[#e8e5e2] bg-white"><div className="flex items-center gap-2.5 p-2.5">{canSelect && <input aria-label={`Select ${color.label} variants of ${product.productName}`} type="checkbox" className="h-4 w-4 flex-none accent-[#C85956]" checked={isSelected(color.variants)} onChange={(event) => onToggleVariants(color.variants.map((variant) => variant.variantId), event.target.checked)} />}<button type="button" aria-expanded={colorOpen} onClick={() => openColor(color)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">{colorOpen ? <ChevronDown className="h-3.5 w-3.5 flex-none text-[#C85956]" /> : <ChevronRight className="h-3.5 w-3.5 flex-none text-[#8d8076]" />}<VariantImage image={color.variants[0].image} alt={`${product.productName} in ${color.label}`} /><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-bold text-[#403730]">{color.label}</span><span className="mt-1 text-[9px] text-[#8d8076]">{color.variants.length} {color.variants.length === 1 ? "size" : "sizes"}</span></span></button></div>{colorOpen && <div className="divide-y divide-[#f0efed] border-t border-[#eeece9]">{color.variants.map((variant) => { const status = statusMeta(variant.stockStatus); return <div key={variant.variantId} className="flex items-center gap-3 px-3 py-2.5">{canSelect && <input aria-label={`Select ${variant.sku}`} type="checkbox" className="h-4 w-4 flex-none accent-[#C85956]" checked={selected.includes(variant.variantId)} onChange={(event) => onToggleVariant(variant.variantId, event.target.checked)} />}<div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><span title={variant.color ?? "Default color"}><ColorSwatch swatchType={variant.swatchType} primaryColor={variant.primaryColor} secondaryColor={variant.secondaryColor} size={12} /></span><p className="text-[10.5px] font-bold text-[#51473f]">{variant.size || "One size"}</p></div><code className="mt-1 block truncate text-[8px] text-[#94867c]">{variant.sku}</code></div><div className="text-right"><p className="text-[11px] font-extrabold tabular-nums text-[#302924]">{variant.quantity}</p><p className="text-[8px] text-[#94867c]">available</p></div><span className={`h-2 w-2 flex-none rounded-full ${status.dot}`} title={status.label} /></div>; })}</div>}</div>;
        })}</div>}
      </article>;
    })}</div>
  </>;
}

function AggregateCell({ value, accent = false, className = "" }: { value: number; accent?: boolean; className?: string }) {
  return <td className={`text-center ${className}`}><p className={`text-[14px] font-extrabold tabular-nums ${accent ? "text-[#C85956]" : "text-[#403730]"}`}>{value}</p><p className="mt-0.5 text-[8.5px] text-[#94867c]">units</p></td>;
}

function GroupStatus({ summary, className = "" }: { summary: ReturnType<typeof stockGroupSummary>; className?: string }) {
  return <td className={`text-center ${className}`}>{summary.issueCount ? <span className="text-[9.5px] font-bold text-[#C85956]">{summary.issueCount} need restock</span> : <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9.5px] font-bold ${summary.status.badge}`}><span className={`h-1.5 w-1.5 rounded-full ${summary.status.dot}`} />Healthy</span>}</td>;
}

export default function InventoryManager({ variants, returnVariants, activityVariants, history, brandSlug, isMahalyPartner, accessLevel, readOnly, view, totalMatching }: {
  // The current page's variants only (server-paginated — see
  // lib/data/brandPortal.ts's getInventoryPageForBrand) when view is
  // "inventory"; ignored when view is "activity".
  variants: BrandVariant[];
  // Full active Zakhnook-held catalog used only by the return drawer. The
  // main Inventory table remains server-paginated through `variants`.
  returnVariants: WarehouseVariantRow[];
  // A brand's full active catalog, fetched ONLY when view is "activity" —
  // used solely to label each of the (at most 100) recent movement rows
  // with a product name/SKU. Empty on an "inventory" view; never used for
  // rendering the Inventory grid itself, which relies entirely on `variants`.
  activityVariants: BrandVariant[];
  history: InventoryMovement[];
  brandSlug?: string;
  isMahalyPartner: boolean;
  accessLevel: "owner" | "assistant";
  readOnly: boolean;
  view: InventoryView;
  totalMatching?: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [type, setType] = useState<InventoryAdjustmentType>(isMahalyPartner ? "remove" : "add");
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [addingStock, setAddingStock] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [restockQuantities, setRestockQuantities] = useState<Record<string, number>>({});
  const [restockNote, setRestockNote] = useState("");
  const [restockExpectedArrival, setRestockExpectedArrival] = useState("");
  const [minimumRestockArrival, setMinimumRestockArrival] = useState("");
  const restockOperationKey = useRef<string | null>(null);
  const [activityQuery, setActivityQuery] = useState("");
  const [activitySource, setActivitySource] = useState("");
  const [activitySort, setActivitySort] = useState<LocalSort>("date-desc");
  const operationKey = useRef<string | null>(null);
  const variantById = useMemo(() => new Map(activityVariants.map((variant) => [variant.variantId, variant])), [activityVariants]);
  const selectableVariantById = useMemo(() => new Map(variants.map((variant) => [variant.variantId, variant])), [variants]);
  const selectedRows = useMemo(() => selected.map((id) => selectableVariantById.get(id)).filter(Boolean) as BrandVariant[], [selected, selectableVariantById]);
  const canAdjustStock = !readOnly && !isMahalyPartner;
  const canRequestRestock = !readOnly && isMahalyPartner && accessLevel === "owner";
  const canSelect = canAdjustStock || (canRequestRestock && addingStock);
  const resultingQuantity = (current: number) => type === "add" ? current + amount : type === "remove" ? current - amount : amount;
  const availableReasons = INVENTORY_REASONS.filter((item) => {
    if (type === "add") return !["Damaged Items", "Lost Items"].includes(item);
    if (type === "remove") return !["New Stock Received", "Returned Items"].includes(item);
    return item !== "New Stock Received";
  });

  function validationError() {
    if (!selectedRows.length) return "Select at least one variant.";
    if (!reason) return "Choose why you are changing this stock.";
    if (!Number.isInteger(amount) || amount < 0) return "Quantity must be a whole, non-negative number.";
    if (type !== "set" && amount === 0) return "Enter a quantity greater than zero.";
    if (selectedRows.some((row) => resultingQuantity(row.quantity) < 0)) return "This adjustment would make inventory negative.";
    if (isMahalyPartner && selectedRows.some((row) => resultingQuantity(row.quantity) > row.quantity)) return "Use a Local Warehouse transfer to increase live stock.";
    return "";
  }

  function reviewAdjustment() {
    const nextError = validationError();
    if (nextError) return setError(nextError);
    setError("");
    setConfirming(true);
  }

  async function apply() {
    const nextError = validationError();
    if (nextError) return setError(nextError);
    setBusy(true);
    setError("");
    setSuccess("");
    operationKey.current ??= crypto.randomUUID();
    const res = await fetch(`/api/brand-portal/inventory/adjustments${brandSlug ? `?brand=${encodeURIComponent(brandSlug)}` : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": operationKey.current },
      body: JSON.stringify({
        adjustments: selectedRows.map((row) => ({ variantId: row.variantId, type, amount, currentQuantity: row.quantity })),
        reason,
        note,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "We couldn't apply this inventory adjustment. Review the values and try again.");
      setBusy(false);
      return;
    }
    operationKey.current = null;
    setBusy(false);
    setConfirming(false);
    setAdjustmentOpen(false);
    setSelected([]);
    setReason("");
    setNote("");
    setSuccess(`${selectedRows.length} ${selectedRows.length === 1 ? "variant" : "variants"} updated.`);
    router.refresh();
  }

  function toggleVariant(variantId: string, checked: boolean) {
    setSuccess("");
    setSelected((current) => checked ? [...new Set([...current, variantId])] : current.filter((id) => id !== variantId));
  }

  function toggleVariants(variantIds: string[], checked: boolean) {
    setSuccess("");
    const groupIds = new Set(variantIds);
    setSelected((current) => checked
      ? [...new Set([...current, ...variantIds])]
      : current.filter((id) => !groupIds.has(id)));
  }

  function removeSelectedVariant(variantId: string) {
    if (selectedRows.length === 1 && selectedRows[0]?.variantId === variantId) {
      clearSelection();
      setSuccess("");
      return;
    }
    setSuccess("");
    setSelected((current) => current.filter((id) => id !== variantId));
    setRestockQuantities((current) => {
      const next = { ...current };
      delete next[variantId];
      return next;
    });
    setConfirming(false);
    setError("");
  }

  function clearSelection() {
    setSelected([]);
    setAdjustmentOpen(false);
    setConfirming(false);
    setError("");
    setRestockQuantities({});
    setRestockNote("");
    setRestockExpectedArrival("");
    setMinimumRestockArrival("");
    setAddingStock(false);
  }

  function startAddingStock() {
    setReturnOpen(false);
    setAddingStock(true);
    setSuccess("");
    setError("");
  }

  function openRestockRequest() {
    setError("");
    setConfirming(false);
    const now = new Date();
    const suggested = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    suggested.setMinutes(Math.ceil(suggested.getMinutes() / 15) * 15, 0, 0);
    setMinimumRestockArrival(localDateTimeValue(now));
    setRestockExpectedArrival((current) => current || localDateTimeValue(suggested));
    setRestockQuantities((current) => Object.fromEntries(selectedRows.map((row) => [
      row.variantId,
      current[row.variantId] ?? Math.max(1, row.suggestedRestock),
    ])));
    setAdjustmentOpen((open) => !open);
  }

  function reviewRestockRequest() {
    if (selectedRows.some((row) => !Number.isInteger(restockQuantities[row.variantId]) || restockQuantities[row.variantId] <= 0)) {
      setError("Enter a positive whole quantity for every selected variant.");
      return;
    }
    const expectedArrival = restockExpectedArrival ? new Date(restockExpectedArrival) : null;
    if (!expectedArrival || Number.isNaN(expectedArrival.getTime()) || expectedArrival.getTime() < Date.now() - 5 * 60 * 1000) {
      setError("Choose a valid future arrival date and time.");
      return;
    }
    setError("");
    setConfirming(true);
  }

  async function submitRestockRequest() {
    setBusy(true);
    setError("");
    restockOperationKey.current ??= crypto.randomUUID();
    try {
      const res = await fetch(`/api/brand-portal/warehouse/transfers${brandSlug ? `?brand=${encodeURIComponent(brandSlug)}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": restockOperationKey.current },
        body: JSON.stringify({
          items: selectedRows.map((row) => ({ variantId: row.variantId, requestedQty: restockQuantities[row.variantId] })),
          note: restockNote.trim() || undefined,
          expectedArrivalAt: new Date(restockExpectedArrival).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "We couldn't submit this restock request.");
      restockOperationKey.current = null;
      const count = selectedRows.length;
      clearSelection();
      setSuccess(`Restock request submitted for ${count} ${count === 1 ? "variant" : "variants"}.`);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We couldn't submit this restock request.");
    } finally {
      setBusy(false);
    }
  }

  const filteredHistory = history.filter((movement) => {
    const variant = variantById.get(movement.variantId);
    const query = activityQuery.trim().toLocaleLowerCase();
    if (query && !`${variant?.productName ?? ""} ${variant?.sku ?? movement.variantId} ${movement.reason} ${movement.note ?? ""}`.toLocaleLowerCase().includes(query)) return false;
    return !activitySource || movement.source === activitySource;
  }).sort((first, second) => {
    const direction = activitySort.endsWith("-desc") ? -1 : 1;
    const firstVariant = variantById.get(first.variantId);
    const secondVariant = variantById.get(second.variantId);
    if (activitySort.startsWith("variant-")) return direction * (firstVariant?.sku ?? first.variantId).localeCompare(secondVariant?.sku ?? second.variantId, undefined, { numeric: true });
    if (activitySort.startsWith("change-")) return direction * (first.quantityDelta - second.quantityDelta);
    if (activitySort.startsWith("balance-")) return direction * (first.newQuantity - second.newQuantity);
    if (activitySort.startsWith("reason-")) return direction * first.reason.localeCompare(second.reason);
    if (activitySort.startsWith("source-")) return direction * first.source.localeCompare(second.source);
    return direction * (Date.parse(first.createdAt) - Date.parse(second.createdAt));
  });
  const activitySources = [...new Set(history.map((movement) => movement.source))].sort();

  function downloadActivity() {
    const blob = new Blob([`\uFEFF${activityCsv(filteredHistory, variantById)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${brandSlug ?? "brand"}-inventory-activity.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (view === "activity") {
    return <>
      <div data-dashboard-filters="true" className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="order-[1] min-w-0 sm:w-[320px]"><span className="sr-only">Search inventory activity</span><input value={activityQuery} onChange={(event) => setActivityQuery(event.target.value)} autoComplete="off" placeholder="Search product, SKU or reason…" className={`${fieldClass} mt-0`} /></label>
          <button type="button" onClick={downloadActivity} className="order-[3] inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#e3d8d0] px-3 text-[11px] font-bold text-[#5d5148] transition-colors hover:border-[#C85956]/30 hover:text-[#C85956]"><Download aria-hidden="true" className="h-3.5 w-3.5" />Export CSV</button>
          <DashboardMoreFilters label="More activity filters" active={Boolean(activitySource)}>
            <DashboardFilterField label="Source"><select value={activitySource} onChange={(event) => setActivitySource(event.target.value)} className={`${dashboardFilterControl} w-full`}><option value="">All sources</option>{activitySources.map((source) => <option key={source} value={source}>{sourceLabel(source)}</option>)}</select></DashboardFilterField>
          </DashboardMoreFilters>
      </div>
    <section className="mt-4 overflow-hidden rounded-[20px] border border-[#eadfd7] bg-white shadow-[0_10px_34px_rgba(72,50,36,.04)]">
      {filteredHistory.length ? <>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[820px] text-left text-[12px]"><thead className="border-b border-[#eee7e1] bg-[#fcfaf8] text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8d8076]"><tr><InventorySortHeader field="variant" label="Variant" sort={activitySort} onSort={(field) => setActivitySort((current) => toggleLocalSort(current, field))} className="px-5 py-3" /><InventorySortHeader field="change" label="Change" sort={activitySort} onSort={(field) => setActivitySort((current) => toggleLocalSort(current, field, "desc"))} /><InventorySortHeader field="balance" label="Before / after" sort={activitySort} onSort={(field) => setActivitySort((current) => toggleLocalSort(current, field, "desc"))} /><InventorySortHeader field="reason" label="Reason" sort={activitySort} onSort={(field) => setActivitySort((current) => toggleLocalSort(current, field))} /><InventorySortHeader field="source" label="Source" sort={activitySort} onSort={(field) => setActivitySort((current) => toggleLocalSort(current, field))} /><InventorySortHeader field="date" label="Date" sort={activitySort} onSort={(field) => setActivitySort((current) => toggleLocalSort(current, field, "desc"))} className="pr-5 text-right" /></tr></thead><tbody className="divide-y divide-[#f0e9e3]">{filteredHistory.map((movement) => {
          const variant = variantById.get(movement.variantId);
          return <tr key={movement.id} className="hover:bg-[#fdfbf9]"><td className="px-5 py-3.5"><p className="font-bold text-[#403730]">{variant?.productName ?? "Archived product"}</p><code className="mt-1 block text-[9.5px] text-[#8d8076]">{variant?.sku ?? movement.variantId}</code></td><td><span className={`font-extrabold tabular-nums ${movement.quantityDelta < 0 ? "text-red-700" : movement.quantityDelta > 0 ? "text-emerald-700" : "text-[#756960]"}`}>{movement.quantityDelta > 0 ? "+" : ""}{movement.quantityDelta}</span></td><td className="font-bold tabular-nums text-[#51473f]">{movement.previousQuantity} → {movement.newQuantity}</td><td className="max-w-[250px] pr-4"><p className="font-semibold text-[#51473f]">{movement.reason}</p>{movement.note && <p className="mt-1 truncate text-[10px] text-[#8d8076]">{movement.note}</p>}</td><td><span className="rounded-md bg-[#f3eee9] px-2 py-1 text-[9.5px] font-bold text-[#756960]">{sourceLabel(movement.source)}</span></td><td className="pr-5 text-right text-[10px] text-[#8d8076]">{formatDateTime(movement.createdAt)}</td></tr>;
        })}</tbody></table></div>
        <div className="divide-y divide-[#eee7e1] md:hidden">{filteredHistory.map((movement) => {
          const variant = variantById.get(movement.variantId);
          return <article key={movement.id} className="px-4 py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[12px] font-bold text-[#403730]">{variant?.productName ?? "Archived product"}</p><code className="mt-1 block truncate text-[9px] text-[#8d8076]">{variant?.sku ?? movement.variantId}</code></div><span className={`text-[13px] font-extrabold tabular-nums ${movement.quantityDelta < 0 ? "text-red-700" : movement.quantityDelta > 0 ? "text-emerald-700" : "text-[#756960]"}`}>{movement.quantityDelta > 0 ? "+" : ""}{movement.quantityDelta}</span></div><div className="mt-3 flex items-center justify-between gap-3 text-[10px]"><p className="font-semibold text-[#51473f]">{movement.reason}</p><p className="tabular-nums text-[#8d8076]">{movement.previousQuantity} → {movement.newQuantity}</p></div><div className="mt-2 flex items-center justify-between gap-3 text-[9.5px] text-[#94867c]"><span>{sourceLabel(movement.source)}</span><span>{formatDateTime(movement.createdAt)}</span></div></article>;
        })}</div>
      </> : <div className="px-5 py-14 text-center"><RotateCcw aria-hidden="true" className="mx-auto h-6 w-6 text-[#b8aaa0]" /><p className="mt-3 text-[12px] font-bold text-[#403730]">No matching activity</p><p className="mt-1 text-[10.5px] text-[#8d8076]">Clear the search or choose another source.</p></div>}
    </section>
    </>;
  }

  return <div className="space-y-3">
    {readOnly && <section className="rounded-2xl border border-[#e5ddd6] bg-[#f6f2ee] px-4 py-3 text-[10.5px] text-[#756960]">Admin preview is read-only. Switch back to your own brand account to adjust inventory.</section>}
    {canRequestRestock && <section aria-label="Inventory stock actions" className="flex flex-col gap-3 rounded-2xl border border-[#e4d9d1] bg-[#fcfaf8] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-[11.5px] font-extrabold text-[#302924]">Stock actions</p><p className="mt-1 text-[9.5px] leading-4 text-[#81746b]">Send new units to Zakhnook, or request available units back to your brand.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={addingStock} onClick={startAddingStock} className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[10.5px] font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C85956]/15 ${addingStock ? "bg-[#A94442] text-white" : "bg-[#C85956] text-white hover:bg-[#b84e4b]"}`}><PackagePlus aria-hidden="true" className="h-3.5 w-3.5" />Add stock</button>
        <button type="button" onClick={() => { clearSelection(); setReturnOpen(true); }} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#d9cec6] bg-white px-4 text-[10.5px] font-bold text-[#5d5148] transition hover:border-[#C85956]/35 hover:text-[#C85956] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C85956]/15"><ArrowDownToLine aria-hidden="true" className="h-3.5 w-3.5" />Return stock</button>
      </div>
    </section>}
    {addingStock && canRequestRestock && selectedRows.length === 0 ? <section role="status" className="flex items-center justify-between gap-3 rounded-2xl border border-[#ead7d4] bg-[#fff8f7] px-4 py-3"><p className="text-[10.5px] font-semibold text-[#6f5b55]">Select the Variants you want to send to Zakhnook, then continue from the selection tray.</p><button type="button" onClick={clearSelection} className="h-8 flex-none rounded-lg px-2 text-[10px] font-bold text-[#8d8076] hover:bg-white hover:text-[#C85956]">Cancel</button></section> : null}
    <div aria-live="polite">{success && <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-[11px] font-bold text-emerald-800"><Check aria-hidden="true" className="h-4 w-4" />{success}</div>}</div>

    {selectedRows.length > 0 && canRequestRestock && <section className="sticky top-3 z-20 overflow-hidden rounded-2xl border border-[#d9cec6] bg-[#fffdfb]/95 shadow-[0_16px_45px_rgba(72,50,36,.13)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div className="flex items-center gap-3"><span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-[#C85956] px-2 text-[11px] font-extrabold tabular-nums text-white">{selectedRows.length}</span><div><p className="text-[11.5px] font-bold text-[#403730]">{selectedRows.length === 1 ? "Variant selected" : "Variants selected"}</p><p className="text-[9.5px] text-[#8d8076]">Create one replenishment request for this selection.</p></div></div><div className="flex items-center gap-2"><button type="button" onClick={clearSelection} className="h-9 px-2 text-[10.5px] font-bold text-[#8d8076] hover:text-[#403730]">Clear</button><button type="button" onClick={openRestockRequest} className="h-9 rounded-xl bg-[#C85956] px-4 text-[10.5px] font-bold text-white transition-colors hover:bg-[#b84e4b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C85956]/15">{adjustmentOpen ? "Close" : "Continue"}</button></div></div>
      <SelectedVariantChips variants={selectedRows} onRemove={removeSelectedVariant} />
      {adjustmentOpen && <div className="border-t border-[#e8dfd8] bg-[#fcfaf8] p-4">
        {!confirming ? <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{selectedRows.map((row) => <label key={row.variantId} className="rounded-xl border border-[#e7ddd5] bg-white p-3"><span className="flex min-w-0 items-start gap-3"><VariantImage image={row.image} alt={`${row.productName}${row.color ? ` in ${row.color}` : ""}`} /><span className="min-w-0 flex-1"><span className="flex min-w-0 items-start justify-between gap-3"><span className="min-w-0"><span className="block truncate text-[11px] font-bold text-[#403730]">{row.productName}</span><span className="mt-1 block truncate text-[9px] text-[#81746b]">{row.color || "No color"} · {row.size || "One size"}</span><code className="mt-1 block truncate text-[8.5px] text-[#94867c]">{row.sku}</code></span><span className="flex-none text-right text-[9px] font-bold tabular-nums text-[#8d8076]">{row.quantity} available<br />{row.incomingQuantity} incoming</span></span></span></span><span className="mt-3 flex items-center gap-2"><span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8d8076]">Send</span><input aria-label={`Restock quantity for ${row.sku}`} type="number" inputMode="numeric" min={1} step={1} value={restockQuantities[row.variantId] ?? ""} onChange={(event) => setRestockQuantities((current) => ({ ...current, [row.variantId]: Math.max(0, Math.trunc(Number(event.target.value) || 0)) }))} className={`${fieldClass} mt-0 ml-auto w-24 tabular-nums`} /></span></label>)}</div><div className="mt-3 grid gap-3 sm:grid-cols-[minmax(220px,.8fr)_minmax(0,1fr)_auto] sm:items-end"><label><span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8d8076]">Expected arrival</span><input type="datetime-local" value={restockExpectedArrival} min={minimumRestockArrival} onChange={(event) => setRestockExpectedArrival(event.target.value)} className={fieldClass} /></label><label className="min-w-0"><span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8d8076]">Note <span className="font-medium normal-case tracking-normal">(optional)</span></span><input value={restockNote} onChange={(event) => setRestockNote(event.target.value)} autoComplete="off" placeholder="Packaging or delivery notes…" className={fieldClass} /></label><button type="button" onClick={reviewRestockRequest} className="h-10 rounded-xl bg-[#242424] px-4 text-[10.5px] font-bold text-white hover:bg-[#3a332e]">Review request</button></div></> : <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex gap-3"><ClipboardList aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-[#C85956]" /><div><p className="text-[12px] font-bold text-[#403730]">Submit {selectedRows.reduce((sum, row) => sum + (restockQuantities[row.variantId] ?? 0), 0)} incoming units across {selectedRows.length} {selectedRows.length === 1 ? "variant" : "variants"}</p><p className="mt-1 text-[10px] text-[#81746b]">Expected arrival: <strong className="text-[#51473f]">{new Date(restockExpectedArrival).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</strong>. Available stock will not change until Zakhnook receives and checks these units.</p></div></div><div className="flex gap-2"><button type="button" onClick={() => setConfirming(false)} disabled={busy} className="h-9 rounded-xl border border-[#ddd2ca] bg-white px-4 text-[10.5px] font-bold text-[#5d5148] hover:bg-[#f8f4f0]">Back</button><button type="button" onClick={submitRestockRequest} disabled={busy} className="h-9 rounded-xl bg-[#C85956] px-4 text-[10.5px] font-bold text-white hover:bg-[#b84e4b] disabled:opacity-50">{busy ? "Submitting…" : "Submit request"}</button></div></div>}
        {error && <p role="alert" className="mt-3 text-[10.5px] font-bold text-red-700">{error}</p>}
      </div>}
    </section>}

    {selectedRows.length > 0 && canAdjustStock && <section className="sticky top-3 z-20 overflow-hidden rounded-2xl border border-[#d9cec6] bg-[#fffdfb]/95 shadow-[0_16px_45px_rgba(72,50,36,.13)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div className="flex items-center gap-3"><span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-[#C85956] px-2 text-[11px] font-extrabold tabular-nums text-white">{selectedRows.length}</span><div><p className="text-[11.5px] font-bold text-[#403730]">{selectedRows.length === 1 ? "Variant selected" : "Variants selected"}</p><p className="text-[9.5px] text-[#8d8076]">Adjust only the variants you checked.</p></div></div><div className="flex items-center gap-2"><button type="button" onClick={clearSelection} className="h-9 px-2 text-[10.5px] font-bold text-[#8d8076] hover:text-[#403730]">Clear</button><button type="button" onClick={() => { setAdjustmentOpen((open) => !open); setConfirming(false); setError(""); }} className="h-9 rounded-xl bg-[#C85956] px-4 text-[10.5px] font-bold text-white transition-colors hover:bg-[#b84e4b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C85956]/15">{adjustmentOpen ? "Close adjustment" : "Adjust stock"}</button></div></div>
      <SelectedVariantChips variants={selectedRows} onRemove={removeSelectedVariant} />
      {adjustmentOpen && <div className="border-t border-[#e8dfd8] bg-[#fcfaf8] p-4">
        {!confirming ? <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[150px_130px_210px_minmax(220px,1fr)_auto] xl:items-end">
          <label><span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8d8076]">Action</span><select value={type} onChange={(event) => { setType(event.target.value as InventoryAdjustmentType); setReason(""); setError(""); }} className={fieldClass}>{!isMahalyPartner && <option value="add">Add stock</option>}<option value="remove">Remove stock</option><option value="set">Set exact stock</option></select></label>
          <label><span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8d8076]">Quantity</span><input type="number" inputMode="numeric" min={0} step={1} value={amount} onChange={(event) => setAmount(Math.max(0, Math.trunc(Number(event.target.value) || 0)))} className={`${fieldClass} tabular-nums`} /></label>
          <label><span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8d8076]">Reason</span><select value={reason} onChange={(event) => setReason(event.target.value)} className={fieldClass}><option value="">Choose a reason…</option>{availableReasons.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8d8076]">Note <span className="font-medium normal-case tracking-normal">(optional)</span></span><input value={note} onChange={(event) => setNote(event.target.value)} autoComplete="off" placeholder="Add useful context…" className={fieldClass} /></label>
          <button type="button" onClick={reviewAdjustment} className="h-10 rounded-xl bg-[#242424] px-4 text-[10.5px] font-bold text-white transition-colors hover:bg-[#3a332e] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#242424]/10">Review change</button>
        </div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#756960]">{selectedRows.slice(0, 4).map((row) => <span key={row.variantId}><code>{row.sku}</code>: <strong className="tabular-nums text-[#403730]">{row.quantity} → {resultingQuantity(row.quantity)}</strong></span>)}{selectedRows.length > 4 && <span>+{selectedRows.length - 4} more</span>}</div></> : <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex gap-3">{type === "add" ? <PackagePlus aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-emerald-700" /> : <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-amber-700" />}<div><p className="text-[12px] font-bold text-[#403730]">Confirm {type === "set" ? "exact stock" : `${type} stock`} for {selectedRows.length} {selectedRows.length === 1 ? "variant" : "variants"}</p><p className="mt-1 text-[10px] text-[#81746b]">Reason: {reason}{note ? ` · ${note}` : ""}. Every change will be recorded in Activity.</p></div></div><div className="flex gap-2"><button type="button" onClick={() => setConfirming(false)} disabled={busy} className="h-9 rounded-xl border border-[#ddd2ca] bg-white px-4 text-[10.5px] font-bold text-[#5d5148] hover:bg-[#f8f4f0]">Back</button><button type="button" onClick={apply} disabled={busy} className="h-9 rounded-xl bg-[#C85956] px-4 text-[10.5px] font-bold text-white hover:bg-[#b84e4b] disabled:opacity-50">{busy ? "Applying…" : "Confirm adjustment"}</button></div></div>}
        {error && <p role="alert" className="mt-3 text-[10.5px] font-bold text-red-700">{error}</p>}
      </div>}
    </section>}

    <section className="overflow-hidden rounded-[20px] border border-[#eadfd7] bg-white shadow-[0_10px_34px_rgba(72,50,36,.04)]">
      <div className="flex items-center justify-between border-b border-[#eee7e1] px-4 py-3.5 sm:px-5"><div><p className="text-[11.5px] font-extrabold text-[#302924]">Variant stock</p><p className="mt-1 text-[10px] text-[#8d8076]">{totalMatching ?? variants.length} matching {(totalMatching ?? variants.length) === 1 ? "variant" : "variants"}</p></div>{variants.some((variant) => variant.suggestedRestock > 0) && <p className="hidden text-[9.5px] font-bold text-[#C85956] sm:block">Restock suggestions use 30-day sales + your alert buffer</p>}</div>
      <VariantStockHierarchy
        variants={variants}
        selected={selected}
        canSelect={canSelect}
        isMahalyPartner={isMahalyPartner}
        onToggleVariant={toggleVariant}
        onToggleVariants={toggleVariants}
      />
    </section>
    <ReturnRequestDrawer open={returnOpen} onClose={() => setReturnOpen(false)} onSubmitted={() => setSuccess("Return request submitted for warehouse review.")} variants={returnVariants} brandParam={brandSlug} />
  </div>;
}
