"use client";

import type { OptionSwatchType, SellingStatus, TaxonomyNode } from "@/types";
import OptionValueMultiSelect from "./OptionValueMultiSelect";
import VariantMatrix from "./VariantMatrix";
import { calculateStockStatus, effectiveLowStockThreshold } from "@/lib/inventory/stockStatus";
import { calculateTotalInventory } from "@/lib/inventory/readiness";
import type { NewColorInput } from "./ColorOptionPicker";

export interface OptionTypeOption {
  id: string;
  name: string;
  key: string;
  isSystem: boolean;
  brandId?: string;
  isArchived?: boolean;
}
export interface OptionValueOption {
  id: string;
  optionTypeId: string;
  label: string;
  swatchType?: OptionSwatchType;
  primaryColor?: string;
  secondaryColor?: string;
  brandId?: string;
  isArchived?: boolean;
}

export interface VariantRow {
  id?: string;
  optionValueIds: string[];
  sku?: string;
  quantity: number;
  openingStock?: number;
  variantPrice?: number;
  lowStockThresholdOverride?: number;
  sellingStatus: SellingStatus;
}

export interface InventoryVariantsValue {
  defaultLowStockThreshold: number;
  optionTypeIds: string[]; // ordered — Color/Size are the only editable axes; a 3rd id here is legacy-only
  valueIdsByOptionType: Record<string, string[]>;
  allowedCombinations: string[][]; // retained for legacy data compatibility; no longer editable from this editor
  variants: VariantRow[];
  colorImages: Record<string, string>; // optionValueId -> url
}

// The Variant Matrix is Color x Size only (see InventoryVariantsSection rebuild spec).
// A product created before this rebuild may still carry a 3rd custom option type;
// that data is preserved and rendered read-adjacent below the Matrix, but no new
// custom option types can be created from this editor.
export default function InventoryVariantsSection({
  value,
  onChange,
  availableOptionTypes,
  availableOptionValues,
  onCreateOptionValue,
  currency: _currency,
  productSkuPreview,
  productPrice: _productPrice,
  disabled,
  taxonomyNodes,
  productTypeId,
  inventoryHref,
  productPublished = false,
  onCellClick,
}: {
  value: InventoryVariantsValue;
  onChange: (next: InventoryVariantsValue) => void;
  availableOptionTypes: OptionTypeOption[];
  availableOptionValues: OptionValueOption[];
  onCreateOptionType: (name: string) => Promise<OptionTypeOption>;
  onCreateOptionValue: (optionTypeId: string, label: string, colorInput?: NewColorInput) => Promise<OptionValueOption>;
  currency: "USD" | "EGP";
  productSkuPreview: string;
  productPrice: number;
  disabled?: boolean;
  taxonomyNodes: TaxonomyNode[];
  productTypeId: string;
  inventoryHref?: string;
  productPublished?: boolean;
  onCellClick?: (colorId: string, sizeId: string, existing: VariantRow | undefined) => void;
}) {
  const colorType = availableOptionTypes.find((t) => t.key === "color");
  const sizeType = availableOptionTypes.find((t) => t.key === "size");

  const set = (patch: Partial<InventoryVariantsValue>) => onChange({ ...value, ...patch });

  const colorValueIds = colorType ? value.valueIdsByOptionType[colorType.id] ?? [] : [];
  const sizeValueIds = sizeType ? value.valueIdsByOptionType[sizeType.id] ?? [] : [];
  const colorValues = colorValueIds
    .map((id) => availableOptionValues.find((v) => v.id === id))
    .filter((v): v is OptionValueOption => Boolean(v));
  const sizeValues = sizeValueIds
    .map((id) => availableOptionValues.find((v) => v.id === id))
    .filter((v): v is OptionValueOption => Boolean(v));

  const availableColorValues = colorType
    ? availableOptionValues.filter((v) => v.optionTypeId === colorType.id && (!v.isArchived || colorValueIds.includes(v.id)))
    : [];
  const availableSizeValues = sizeType
    ? availableOptionValues.filter((v) => v.optionTypeId === sizeType.id && (!v.isArchived || sizeValueIds.includes(v.id)))
    : [];

  const ensureOptionTypeActive = (optionTypeId: string) =>
    value.optionTypeIds.includes(optionTypeId) ? value.optionTypeIds : [...value.optionTypeIds, optionTypeId];

  const addColorValue = (id: string) => {
    if (!colorType) return;
    set({
      optionTypeIds: ensureOptionTypeActive(colorType.id),
      valueIdsByOptionType: { ...value.valueIdsByOptionType, [colorType.id]: [...colorValueIds, id] },
    });
  };

  const addSizeValue = (id: string) => {
    if (!sizeType) return;
    set({
      optionTypeIds: ensureOptionTypeActive(sizeType.id),
      valueIdsByOptionType: { ...value.valueIdsByOptionType, [sizeType.id]: [...sizeValueIds, id] },
    });
  };

  const removeColorRow = (id: string) => {
    if (!colorType) return;
    const affected = value.variants.filter((v) => v.optionValueIds.includes(id));
    if (affected.length > 0) {
      const hasStockOrHistory = affected.some((v) => Boolean(v.id) || v.quantity > 0);
      const message = hasStockOrHistory
        ? `This color has ${affected.length} saved variant(s) with inventory or history. They will be archived, not deleted — their SKUs and stock records are preserved. Continue?`
        : `This color has ${affected.length} unsaved variant(s). They will be removed. Continue?`;
      if (!window.confirm(message)) return;
    }
    const nextValueIds = colorValueIds.filter((v) => v !== id);
    const nextVariants = affected.length === 0
      ? value.variants
      : value.variants.filter((v) => !v.optionValueIds.includes(id) || v.id); // unsaved rows drop; saved rows are archived server-side on save
    const nextColorImages = { ...value.colorImages };
    if (nextValueIds.length === 0 || !colorValueIds.includes(id)) delete nextColorImages[id];
    set({
      valueIdsByOptionType: { ...value.valueIdsByOptionType, [colorType.id]: nextValueIds },
      optionTypeIds: nextValueIds.length === 0 ? value.optionTypeIds.filter((t) => t !== colorType.id) : value.optionTypeIds,
      variants: nextVariants,
      colorImages: nextColorImages,
    });
  };

  const removeSizeColumn = (id: string) => {
    if (!sizeType) return;
    const affected = value.variants.filter((v) => v.optionValueIds.includes(id));
    if (affected.length > 0) {
      const hasStockOrHistory = affected.some((v) => Boolean(v.id) || v.quantity > 0);
      const message = hasStockOrHistory
        ? `This size has ${affected.length} saved variant(s) with inventory or history. They will be archived, not deleted — their SKUs and stock records are preserved. Continue?`
        : `This size has ${affected.length} unsaved variant(s). They will be removed. Continue?`;
      if (!window.confirm(message)) return;
    }
    const nextValueIds = sizeValueIds.filter((v) => v !== id);
    const nextVariants = affected.length === 0
      ? value.variants
      : value.variants.filter((v) => !v.optionValueIds.includes(id) || v.id);
    set({
      valueIdsByOptionType: { ...value.valueIdsByOptionType, [sizeType.id]: nextValueIds },
      optionTypeIds: nextValueIds.length === 0 ? value.optionTypeIds.filter((t) => t !== sizeType.id) : value.optionTypeIds,
      variants: nextVariants,
    });
  };

  const createColorValue = async (input: NewColorInput) => {
    if (!colorType) return;
    const created = await onCreateOptionValue(colorType.id, input.label, input);
    addColorValue(created.id);
  };

  const createSizeValue = async (label: string) => {
    if (!sizeType) return;
    const created = await onCreateOptionValue(sizeType.id, label);
    addSizeValue(created.id);
  };

  const onChangeColorImage = (colorId: string, url: string) => {
    set({ colorImages: { ...value.colorImages, [colorId]: url } });
  };

  // Legacy: a product created before this rebuild may still carry a 3rd,
  // non-Color/Size option type. Preserve and keep it editable (existing
  // variants reference it), but do not offer creating a new one.
  const legacyOptionTypeIds = value.optionTypeIds.filter((id) => id !== colorType?.id && id !== sizeType?.id);

  const totalInventory = calculateTotalInventory(
    value.variants.map((v) => ({ quantity: v.quantity, sellingStatus: v.sellingStatus, isArchived: false }))
  );
  const stockCounts = value.variants.reduce(
    (counts, variant) => {
      const status = calculateStockStatus(
        variant.quantity,
        effectiveLowStockThreshold(variant.lowStockThresholdOverride, value.defaultLowStockThreshold)
      );
      if (variant.sellingStatus === "active") counts.active += 1;
      if (status === "low_stock") counts.low += 1;
      if (status === "out_of_stock") counts.out += 1;
      return counts;
    },
    { active: 0, low: 0, out: 0 }
  );
  const configurationComplete = colorValueIds.length === 0 || colorValueIds.every((id) => id);
  const readyToPublish = value.variants.some((variant) => variant.sellingStatus === "active" && variant.quantity > 0);

  return (
    <div className="space-y-8">
      {/* Inventory Summary */}
      <div>
        <h3 className="text-[13px] font-semibold text-ink">Inventory Summary</h3>
        <p className="mt-1 text-[12px] text-ink-soft/55">
          Opening stock is recorded once after publishing. Future stock changes must be managed from Inventory.
        </p>
        {inventoryHref && <a href={inventoryHref} className="mt-2 inline-flex text-[12px] font-semibold text-ink underline">Learn more about Inventory</a>}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Total Current Stock", totalInventory],
            ["Active Variants", stockCounts.active],
            ["Low Stock", stockCounts.low],
            ["Out of Stock", stockCounts.out],
          ].map(([label, count]) => (
            <div key={label} className="rounded-md border border-stone-150 bg-stone-50 px-3 py-2.5">
              <span className="text-[10.5px] font-medium text-ink-soft/60">{label}</span>
              <p className="text-[18px] font-bold text-ink">{count}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className={`rounded-md border px-3 py-2.5 ${configurationComplete ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide">Configuration</p>
            <p className="mt-1 text-[12.5px]">{configurationComplete ? "Complete" : "Select at least one color."}</p>
          </div>
          <div className={`rounded-md border px-3 py-2.5 ${readyToPublish ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide">Publishing readiness</p>
            <p className="mt-1 text-[12.5px]">{readyToPublish ? "Ready to publish" : "Needs an active variant with inventory."}</p>
          </div>
        </div>
      </div>

      {/* Default Low Stock Alert */}
      <div>
        <h3 className="text-[13px] font-semibold text-ink">Default Low Stock Alert</h3>
        <div className="mt-1.5 max-w-[220px]">
          <input
            type="number"
            min={0}
            value={value.defaultLowStockThreshold}
            onChange={(e) => set({ defaultLowStockThreshold: Math.max(0, Number(e.target.value) || 0) })}
            className="w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
          />
          <p className="mt-1 text-[11.5px] text-ink-soft/50">
            Default: 5. Applies to every variant without its own custom threshold.
          </p>
        </div>
      </div>

      {/* Variants (Matrix) */}
      {colorType && sizeType ? (
        <VariantMatrix
          colorValues={colorValues}
          sizeValues={sizeValues}
          availableColorValues={availableColorValues}
          availableSizeValues={availableSizeValues}
          variants={value.variants}
          colorImages={value.colorImages}
          productPublished={productPublished}
          disabled={disabled}
          taxonomyNodes={taxonomyNodes}
          productTypeId={productTypeId}
          onAddColor={addColorValue}
          onCreateColor={createColorValue}
          onRemoveColor={removeColorRow}
          onAddSize={addSizeValue}
          onCreateSize={createSizeValue}
          onRemoveSize={removeSizeColumn}
          onChangeColorImage={onChangeColorImage}
          onCellClick={onCellClick}
        />
      ) : (
        <p className="text-[12.5px] text-red-600">
          System Color and Size option types were not found. Contact an administrator.
        </p>
      )}
      {value.variants.length > 0 && (
        <p className="text-[11.5px] text-ink-soft/50">
          Variant SKU namespace: <code>{productSkuPreview}</code>
        </p>
      )}

      {/* Legacy custom option (pre-rebuild data only) */}
      {legacyOptionTypeIds.map((optionTypeId) => {
        const type = availableOptionTypes.find((t) => t.id === optionTypeId);
        if (!type) return null;
        const selectedIds = value.valueIdsByOptionType[optionTypeId] ?? [];
        const valuesForType = availableOptionValues.filter((v) => v.optionTypeId === optionTypeId && (!v.isArchived || selectedIds.includes(v.id)));
        return (
          <div key={optionTypeId} className="rounded-md border border-amber-200 bg-amber-50/50 p-3.5">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-amber-800">
              Legacy variant option — {type.name}
            </p>
            <p className="mt-1 text-[11.5px] text-ink-soft/55">
              This product was created before the Variant Matrix rebuild and still uses a 3rd variant option.
              It is preserved and remains editable here, but new products may only use Color and Size.
            </p>
            <div className="mt-2">
              <OptionValueMultiSelect
                label={type.name}
                options={valuesForType.map((v) => ({ id: v.id, label: v.label }))}
                selectedIds={selectedIds}
                disabled={disabled}
                onToggle={(id) => {
                  const current = value.valueIdsByOptionType[optionTypeId] ?? [];
                  const next = current.includes(id) ? current.filter((v) => v !== id) : [...current, id];
                  set({ valueIdsByOptionType: { ...value.valueIdsByOptionType, [optionTypeId]: next } });
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
