"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Box, ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import type { TaxonomyNode } from "@/types";
import type { OptionValueOption, VariantRow } from "./InventoryVariantsSection";
import ColorSwatch from "./ColorSwatch";
import ColorOptionPicker, { type NewColorInput } from "./ColorOptionPicker";
import SizeValueSelector from "./SizeValueSelector";

type RowState = "not_created" | "created" | "zero_stock";

function rowState(variant: VariantRow): RowState {
  if (!variant.id) return "not_created";
  return variant.quantity > 0 ? "created" : "zero_stock";
}

const ROW_STATE_DOT: Record<RowState, string> = {
  not_created: "bg-stone-300",
  created: "bg-emerald-500",
  zero_stock: "bg-amber-500",
};
const ROW_STATE_LABEL: Record<RowState, string> = {
  not_created: "Not created",
  created: "Created",
  zero_stock: "Zero stock",
};

// Rendered through a portal into document.body, positioned by the
// trigger's own bounding rect (`position: fixed`) instead of being
// absolutely positioned inside the table. The table wrapper scrolls
// horizontally (overflow-x-auto), which also clips vertical overflow —
// an in-flow absolutely-positioned popover gets silently cut off there.
function Popover({
  trigger,
  children,
  align = "left",
}: {
  trigger: (open: (e: React.MouseEvent<HTMLElement>) => void) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left?: number; right?: number } | null>(null);

  const openPopover = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCoords(
      align === "right"
        ? { top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) }
        : { top: rect.bottom + 6, left: rect.left }
    );
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <div className="inline-block">
      {trigger(openPopover)}
      {open && coords && typeof document !== "undefined" && createPortal(
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 w-[360px] max-w-[calc(100vw-16px)] rounded-lg border border-stone-200 bg-white p-3.5 shadow-xl"
            style={{ top: coords.top, left: coords.left, right: coords.right }}
          >
            {children(() => setOpen(false))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

export default function VariantTable({
  colorValues,
  availableColorValues,
  availableSizeValues,
  variants,
  colorImages,
  defaultLowStockThreshold,
  basePrice,
  currency,
  disabled,
  taxonomyNodes,
  productTypeId,
  inventoryHref,
  onAddColor,
  onCreateColor,
  onRemoveColor,
  onAddSizeToColor,
  onCreateSizeForColor,
  onRemoveVariant,
  onUpdateVariant,
}: {
  colorValues: OptionValueOption[];
  availableColorValues: OptionValueOption[];
  availableSizeValues: OptionValueOption[];
  variants: VariantRow[];
  colorImages: Record<string, string>;
  defaultLowStockThreshold: number;
  basePrice: number;
  currency: "USD" | "EGP";
  disabled?: boolean;
  taxonomyNodes: TaxonomyNode[];
  productTypeId: string;
  inventoryHref?: string;
  onAddColor: (id: string) => void;
  onCreateColor: (input: NewColorInput) => Promise<void> | void;
  onRemoveColor: (id: string) => void;
  onAddSizeToColor: (colorId: string, sizeId: string) => void;
  onCreateSizeForColor: (colorId: string, label: string) => Promise<void>;
  onRemoveVariant: (colorId: string, sizeId: string) => void;
  onUpdateVariant: (colorId: string, sizeId: string, patch: Partial<VariantRow>) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapsed = (colorId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(colorId)) next.delete(colorId);
      else next.add(colorId);
      return next;
    });

  const sizeById = useMemo(() => new Map(availableSizeValues.map((s) => [s.id, s])), [availableSizeValues]);

  const rowsByColor = useMemo(() => {
    const map = new Map<string, { size: OptionValueOption; variant: VariantRow }[]>();
    for (const colorId of colorValues.map((c) => c.id)) map.set(colorId, []);
    for (const variant of variants) {
      const colorId = colorValues.find((c) => variant.optionValueIds.includes(c.id))?.id;
      const sizeId = variant.optionValueIds.find((id) => sizeById.has(id));
      if (!colorId || !sizeId) continue;
      const size = sizeById.get(sizeId)!;
      map.get(colorId)?.push({ size, variant });
    }
    return map;
  }, [colorValues, variants, sizeById]);

  const isMultiColor = colorValues.length >= 2;
  const colorsMissingImages = isMultiColor ? colorValues.filter((c) => !colorImages[c.id]) : [];
  const isEmpty = colorValues.length === 0;

  return (
    <div>
      <h3 className="text-[13px] font-semibold text-ink">Variants (Matrix)</h3>
      <p className="mt-1 text-[12px] text-ink-soft/55">Create and manage variants for this product. Add opening stock and price for each variant.</p>

      {colorsMissingImages.length > 0 && (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          This product has multiple colors. Add a primary image for each color before publishing:{" "}
          <strong>{colorsMissingImages.map((c) => c.label).join(", ")}</strong>.
        </p>
      )}

      <div className="mt-3">
        <Popover
          trigger={(open) => (
            <button
              type="button"
              disabled={disabled}
              onClick={open}
              className="flex items-center gap-1.5 rounded-md border border-stone-200 px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              Add Color
            </button>
          )}
        >
          {(close) => (
            <div>
              <p className="mb-2 text-[12px] font-semibold text-ink">Add a Color</p>
              <ColorOptionPicker
                options={availableColorValues}
                selectedIds={colorValues.map((v) => v.id)}
                onToggle={(id) => {
                  if (colorValues.some((v) => v.id === id)) return;
                  onAddColor(id);
                }}
                onCreate={async (input) => onCreateColor(input)}
              />
              <button type="button" onClick={close} className="mt-3 text-[12px] font-semibold text-ink-soft/60 hover:underline">
                Done
              </button>
            </div>
          )}
        </Popover>
      </div>

      {isEmpty ? (
        <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed border-stone-200 bg-stone-50/60 px-6 py-10 text-center">
          <Box className="mb-3 h-8 w-8 text-ink-soft/30" strokeWidth={1.5} />
          <p className="text-[13.5px] font-semibold text-ink">No colors added yet</p>
          <p className="mt-1 text-[12px] text-ink-soft/55">Add a color to start creating variants.</p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-stone-150">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-stone-150 bg-stone-50 text-[11px] font-semibold uppercase tracking-wide text-ink-soft/50">
                <th className="min-w-[200px] px-3 py-2.5">Color / Size</th>
                <th className="px-3 py-2.5">SKU <span className="font-normal normal-case text-ink-soft/40">(Auto)</span></th>
                <th className="px-3 py-2.5">Stock <span className="font-normal normal-case text-ink-soft/40">(Opening Stock)</span></th>
                <th className="px-3 py-2.5" title="Applies from the product default unless overridden here.">Low Stock Alert</th>
                <th className="px-3 py-2.5">
                  Variant Price ({currency}) <span className="font-normal normal-case text-ink-soft/40">(Leave empty for base price)</span>
                </th>
                <th className="px-3 py-2.5">Image <span className="font-normal normal-case text-ink-soft/40">(Color Image)</span></th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-150">
              {colorValues.map((color) => {
                const rows = rowsByColor.get(color.id) ?? [];
                const isCollapsed = collapsed.has(color.id);
                const sizeIdsForColor = rows.map((r) => r.size.id);
                return (
                  <Fragment key={color.id}>
                    <tr className="bg-stone-50/60">
                      <td className="px-3 py-2.5" colSpan={7}>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => toggleCollapsed(color.id)}
                            aria-expanded={!isCollapsed}
                            aria-label={isCollapsed ? `Expand ${color.label}` : `Collapse ${color.label}`}
                            className="rounded p-0.5 text-ink-soft/50 hover:bg-stone-150"
                          >
                            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                          <ColorSwatch swatchType={color.swatchType} primaryColor={color.primaryColor} secondaryColor={color.secondaryColor} size={20} />
                          <span className="text-[13px] font-semibold text-ink">{color.label}</span>
                          {rows.length > 0 && <span className="rounded-full bg-stone-150 px-2 py-0.5 text-[10.5px] font-medium text-ink-soft/60">{rows.length} size{rows.length === 1 ? "" : "s"}</span>}

                          <Popover
                            trigger={(open) => (
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={open}
                                className="flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-[11.5px] font-semibold text-ink hover:border-ink/40 disabled:cursor-not-allowed"
                              >
                                <Plus className="h-3 w-3" strokeWidth={2.5} />
                                Add Size
                              </button>
                            )}
                          >
                            {(close) => (
                              <div className="w-[360px]">
                                <p className="mb-2 text-[12px] font-semibold text-ink">Add a Size for {color.label}</p>
                                <SizeValueSelector
                                  options={availableSizeValues}
                                  selectedIds={sizeIdsForColor}
                                  taxonomyNodes={taxonomyNodes}
                                  productTypeId={productTypeId}
                                  onToggle={(id) => {
                                    if (sizeIdsForColor.includes(id)) return;
                                    onAddSizeToColor(color.id, id);
                                  }}
                                  onCreate={(label) => onCreateSizeForColor(color.id, label)}
                                />
                                <button type="button" onClick={close} className="mt-3 text-[12px] font-semibold text-ink-soft/60 hover:underline">
                                  Done
                                </button>
                              </div>
                            )}
                          </Popover>

                          <div className="ml-auto flex items-center gap-2">
                            {colorImages[color.id] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={colorImages[color.id]} alt="" title="Uploaded from the Media step" className="h-7 w-7 rounded object-cover" />
                            ) : (
                              <span
                                className={`flex h-7 w-7 items-center justify-center rounded border text-[9px] font-semibold ${isMultiColor ? "border-amber-300 bg-amber-50 text-amber-700" : "border-dashed border-stone-200 text-ink-soft/30"}`}
                                title={isMultiColor ? "Missing — upload this color's image in the Media step" : "Optional for a single-color product"}
                              >
                                {isMultiColor ? "!" : "—"}
                              </span>
                            )}
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => onRemoveColor(color.id)}
                              aria-label={`Remove ${color.label} from product`}
                              title="Remove color from product"
                              className="rounded p-1 text-ink-soft/40 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {!isCollapsed && rows.map(({ size, variant }) => {
                      const state = rowState(variant);
                      const persisted = Boolean(variant.id);
                      return (
                        <tr key={`${color.id}-${size.id}`}>
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-2 pl-7">
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ROW_STATE_DOT[state]}`} title={ROW_STATE_LABEL[state]} />
                              {size.label}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {variant.sku ? <code className="select-all text-[12px]">{variant.sku}</code> : <span className="text-[11.5px] text-ink-soft/45">Generated after saving</span>}
                          </td>
                          <td className="px-3 py-2">
                            {persisted ? (
                              <span className="text-[13px] font-semibold text-ink" title="Managed from Inventory once a variant is saved.">
                                {variant.quantity}
                              </span>
                            ) : (
                              <input
                                aria-label={`Opening stock for ${color.label} ${size.label}`}
                                type="number"
                                min={0}
                                step={1}
                                disabled={disabled}
                                value={variant.openingStock ?? variant.quantity}
                                onChange={(e) => {
                                  const openingStock = Math.max(0, Math.trunc(Number(e.target.value) || 0));
                                  onUpdateVariant(color.id, size.id, { openingStock, quantity: openingStock });
                                }}
                                className="w-20 rounded border border-stone-150 px-2 py-1 text-[12.5px] outline-none focus:border-ink/30 disabled:bg-stone-50"
                              />
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              aria-label={`Low stock alert for ${color.label} ${size.label}`}
                              type="number"
                              min={0}
                              disabled={disabled}
                              placeholder={String(defaultLowStockThreshold)}
                              value={variant.lowStockThresholdOverride ?? ""}
                              onChange={(e) => onUpdateVariant(color.id, size.id, { lowStockThresholdOverride: e.target.value ? Math.max(0, Number(e.target.value)) : undefined })}
                              className="w-16 rounded border border-stone-150 px-2 py-1 text-[12.5px] outline-none focus:border-ink/30 disabled:bg-stone-50"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              aria-label={`Variant price for ${color.label} ${size.label}`}
                              type="number"
                              min={0}
                              step="0.01"
                              disabled={disabled}
                              placeholder={`(Base price: ${basePrice} ${currency})`}
                              value={variant.variantPrice ?? ""}
                              onChange={(e) => onUpdateVariant(color.id, size.id, { variantPrice: e.target.value ? Math.max(0, Number(e.target.value)) : undefined })}
                              className="w-32 rounded border border-stone-150 px-2 py-1 text-[12.5px] outline-none focus:border-ink/30 disabled:bg-stone-50"
                            />
                            <p className="mt-0.5 text-[10px] text-ink-soft/40">
                              {variant.variantPrice != null ? "Overrides base price" : `Uses base product price (${basePrice} ${currency})`}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-[11.5px] text-ink-soft/35">—</td>
                          <td className="px-3 py-2 text-right">
                            {persisted && inventoryHref ? (
                              <a href={inventoryHref} className="text-[11.5px] font-semibold text-ink underline">Open Inventory</a>
                            ) : (
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() => onRemoveVariant(color.id, size.id)}
                                aria-label={`Remove ${color.label} ${size.label} variant`}
                                className="rounded p-1 text-ink-soft/40 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {!isCollapsed && rows.length === 0 && (
                      <tr>
                        <td className="px-3 py-2 pl-10 text-[12px] italic text-ink-soft/40" colSpan={7}>No sizes added yet for {color.label}.</td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-soft/55">
        <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${ROW_STATE_DOT.created}`} /> Created</span>
        <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${ROW_STATE_DOT.zero_stock}`} /> Zero stock</span>
        <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${ROW_STATE_DOT.not_created}`} /> Not created</span>
      </div>
    </div>
  );
}
