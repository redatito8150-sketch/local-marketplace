"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import ColorSwatch from "./ColorSwatch";
import ImageUploader from "./ImageUploader";
import type { OptionValueOption, VariantRow } from "./InventoryVariantsSection";

export interface VariantDrawerSaveInput {
  openingStock: number;
  variantPrice: number | undefined;
  lowStockThresholdOverride: number | undefined;
}

// Create/Edit Variant — the only place a Variant is created. A cell click in
// the Matrix opens this Drawer; Save Variant is the single write path that
// turns "not created" into a real Variant row. See VariantMatrix.tsx.
export default function VariantDrawer({
  color,
  size,
  existing,
  colorImageUrl,
  isMultiColor,
  basePrice,
  currency,
  defaultLowStockThreshold,
  inventoryHref,
  onUploadColorImage,
  onSave,
  onCancel,
}: {
  color: OptionValueOption;
  size: OptionValueOption;
  existing: VariantRow | undefined;
  colorImageUrl: string | undefined;
  isMultiColor: boolean;
  basePrice: number;
  currency: "USD" | "EGP";
  defaultLowStockThreshold: number;
  inventoryHref?: string;
  onUploadColorImage: (url: string) => void;
  onSave: (input: VariantDrawerSaveInput) => void;
  onCancel: () => void;
}) {
  const isPersisted = Boolean(existing?.id);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [openingStock, setOpeningStock] = useState(existing?.openingStock ?? existing?.quantity ?? 0);
  const [variantPrice, setVariantPrice] = useState<string>(existing?.variantPrice != null ? String(existing.variantPrice) : "");
  const [lowStockOverride, setLowStockOverride] = useState<string>(
    existing?.lowStockThresholdOverride != null ? String(existing.lowStockThresholdOverride) : ""
  );

  const comboLabel = `${color.label} / ${size.label}`;
  const imageRequired = isMultiColor;
  const canSave = !imageRequired || Boolean(colorImageUrl);

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      openingStock: Math.max(0, Math.trunc(openingStock)),
      variantPrice: variantPrice.trim() ? Math.max(0, Number(variantPrice)) : undefined,
      lowStockThresholdOverride: lowStockOverride.trim() ? Math.max(0, Number(lowStockOverride)) : undefined,
    });
  };

  return (
    <div className="flex h-full flex-col rounded-xl3 border border-stone-150 bg-white">
      <div className="flex items-center justify-between border-b border-stone-150 px-5 py-4">
        <div>
          <h3 className="text-[15px] font-bold text-ink">{isPersisted ? "Edit Variant" : "Create Variant"}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-soft/60">
            <ColorSwatch swatchType={color.swatchType} primaryColor={color.primaryColor} secondaryColor={color.secondaryColor} size={14} />
            {comboLabel}
          </p>
        </div>
        <button ref={closeButtonRef} type="button" onClick={onCancel} aria-label="Close" className="rounded-md p-1.5 text-ink-soft/50 hover:bg-stone-100 hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <div>
          <label className="text-[12px] font-semibold text-ink" htmlFor="variant-sku">SKU (generated automatically)</label>
          <input
            id="variant-sku"
            readOnly
            disabled
            value={existing?.sku ?? "Generated automatically after saving"}
            className="mt-1.5 w-full cursor-not-allowed rounded-md border border-stone-150 bg-stone-50 px-3.5 py-2.5 text-[13px] text-ink-soft/60"
          />
          <p className="mt-1 text-[11px] text-ink-soft/45">Cannot be changed.</p>
        </div>

        {isPersisted ? (
          <div>
            <p className="text-[12px] font-semibold text-ink">Current Stock</p>
            <p className="mt-1.5 text-[18px] font-bold text-ink">{existing?.quantity ?? 0}</p>
            <p className="mt-1 text-[11px] text-ink-soft/45">Managed from Inventory. Opening Stock was already applied and cannot be reapplied here.</p>
            {inventoryHref && (
              <a href={inventoryHref} className="mt-2 inline-flex text-[12px] font-semibold text-ink underline">Open Inventory</a>
            )}
          </div>
        ) : (
          <div>
            <label className="text-[12px] font-semibold text-ink" htmlFor="variant-opening-stock">Opening Stock *</label>
            <input
              id="variant-opening-stock"
              aria-label="Opening Stock"
              type="number"
              min={0}
              step={1}
              value={openingStock}
              onChange={(e) => setOpeningStock(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
              className="mt-1.5 w-full rounded-md border border-stone-150 px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
            />
            <p className="mt-1 text-[11px] text-ink-soft/45">Set the starting inventory. You can manage it later from Inventory.</p>
          </div>
        )}

        <div>
          <label className="text-[12px] font-semibold text-ink" htmlFor="variant-price">Variant Price ({currency})</label>
          <input
            id="variant-price"
            type="number"
            min={0}
            step="0.01"
            placeholder={`Leave blank to use base price (${basePrice} ${currency})`}
            value={variantPrice}
            onChange={(e) => setVariantPrice(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-stone-150 px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
          />
          <p className="mt-1 text-[11px] text-ink-soft/45">Optional. Leave blank to use the base price from Pricing ({basePrice} {currency}).</p>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-[12px] font-semibold text-ink" htmlFor="variant-low-stock">Low Stock Alert</label>
            <span className="text-[11px] text-ink-soft/45">Default: {defaultLowStockThreshold}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              id="variant-low-stock"
              type="number"
              min={0}
              placeholder={String(defaultLowStockThreshold)}
              value={lowStockOverride}
              onChange={(e) => setLowStockOverride(e.target.value)}
              className="w-28 rounded-md border border-stone-150 px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
            />
            {lowStockOverride && (
              <button type="button" onClick={() => setLowStockOverride("")} className="text-[12px] font-semibold text-ink-soft/60 hover:underline">
                Use default
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-ink-soft/45">You will be notified when stock reaches this level.</p>
        </div>

        <div>
          <label className="text-[12px] font-semibold text-ink">
            Color Image {imageRequired ? "*" : "(optional)"}
          </label>
          <p className="mt-0.5 text-[11px] text-ink-soft/45">
            {imageRequired
              ? `Required for multi-color products. This image represents ${color.label} across all sizes and will be available in the Media step.`
              : "Optional for single-color products. The Main Image will be used if no Color image is provided."}
          </p>
          <div className="mt-1.5">
            <ImageUploader
              label=""
              folderId="color-images"
              value={colorImageUrl ? [colorImageUrl] : []}
              onChange={(urls) => onUploadColorImage(urls[0] ?? "")}
              maxImages={1}
            />
          </div>
          {imageRequired && !colorImageUrl && (
            <p className="mt-1 text-[11px] font-medium text-amber-700">A Color image is required before saving this Variant.</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-stone-150 px-5 py-4">
        <button type="button" onClick={onCancel} className="rounded-md border border-stone-200 px-4 py-2.5 text-[13px] font-semibold text-ink hover:border-ink/40">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="rounded-md bg-ink px-4 py-2.5 text-[13px] font-semibold text-cream disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save Variant
        </button>
      </div>
    </div>
  );
}
