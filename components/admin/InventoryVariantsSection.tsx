"use client";

import { AlertCircle, Boxes, ImageIcon, Loader2, PackageOpen, RefreshCw, Tags } from "lucide-react";
import type { OptionSwatchType, SellingStatus, TaxonomyNode } from "@/types";
import OptionValueMultiSelect from "./OptionValueMultiSelect";
import VariantTable from "./VariantTable";
import { buildComboKey } from "@/lib/inventory/variantCombinations";
import { sortSizeOrderables } from "@/lib/inventory/sizeOrder";
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
  // Only meaningful for a custom (non-recognized) Size — see
  // lib/inventory/sizeOrder.ts. Carried through for every option value
  // regardless of type since it's free from the same row.
  sortOrder?: number;
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
  // Read-only display of an already-persisted variant's real, current live
  // quantity — never editable from this form, and always 0 for a brand-new
  // (unsaved) row regardless of anything set here. Stock only ever changes
  // through Inventory (direct brand) or a confirmed warehouse receipt
  // (partner) once the product is published — see Inventory instead.
  quantity: number;
  variantPrice?: number;
  // Mutually exclusive with the product-level Discount % (ProductForm.tsx)
  // — locked/disabled in the UI whenever the product has its own discount,
  // and vice versa, so a variant's effective price never stacks both.
  variantDiscountPercent?: number;
  lowStockThresholdOverride?: number;
  sellingStatus: SellingStatus;
  updatedAt?: string;
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
  onReorderOptionValue,
  currency,
  productSkuPreview: _productSkuPreview,
  productPrice,
  productDiscountPercent,
  disabled,
  taxonomyNodes,
  productTypeId,
  inventoryHref,
  isPartnerBrand,
  optionLoadState = "ready",
  optionLoadError = "",
  onRetryOptions,
}: {
  value: InventoryVariantsValue;
  onChange: (next: InventoryVariantsValue) => void;
  availableOptionTypes: OptionTypeOption[];
  availableOptionValues: OptionValueOption[];
  onCreateOptionType: (name: string) => Promise<OptionTypeOption>;
  onCreateOptionValue: (optionTypeId: string, label: string, colorInput?: NewColorInput) => Promise<OptionValueOption>;
  // A custom Size's up/down arrow in the Matrix — no-op for a recognized
  // size (see lib/inventory/sizeOrder.ts's reorderCustomSize, which
  // refuses those server-side too).
  onReorderOptionValue: (optionValueId: string, direction: "up" | "down") => Promise<void>;
  currency: "USD" | "EGP";
  productSkuPreview: string;
  productPrice: number;
  productDiscountPercent?: number;
  disabled?: boolean;
  taxonomyNodes: TaxonomyNode[];
  productTypeId: string;
  inventoryHref?: string;
  isPartnerBrand?: boolean;
  optionLoadState?: "idle" | "loading" | "ready" | "error";
  optionLoadError?: string;
  onRetryOptions?: () => void;
}) {
  const colorType = availableOptionTypes.find((t) => t.key === "color");
  const sizeType = availableOptionTypes.find((t) => t.key === "size");

  const set = (patch: Partial<InventoryVariantsValue>) => onChange({ ...value, ...patch });

  const colorValueIds = colorType ? value.valueIdsByOptionType[colorType.id] ?? [] : [];
  const sizeValueIds = sizeType ? value.valueIdsByOptionType[sizeType.id] ?? [] : [];
  const colorValues = colorValueIds
    .map((id) => availableOptionValues.find((v) => v.id === id))
    .filter((v): v is OptionValueOption => Boolean(v));
  const activeVariants = value.variants.filter((variant) => variant.sellingStatus === "active");
  const customPricedVariants = value.variants.filter((variant) => variant.variantPrice != null || variant.variantDiscountPercent != null).length;
  const missingColorImages = colorValueIds.length >= 2 ? colorValueIds.filter((id) => !value.colorImages[id]).length : 0;
  // No zero-stock warning here anymore — stock is never entered in this
  // editor, so a fresh variant reading 0 is expected, not a sign the form
  // was left incomplete. Attention is only real gaps: missing color photos
  // or a variant left paused/discontinued.
  const attentionCount = missingColorImages + (value.variants.length - activeVariants.length);

  const availableColorValues = colorType
    ? availableOptionValues.filter((v) => v.optionTypeId === colorType.id && (!v.isArchived || colorValueIds.includes(v.id)))
    : [];
  const availableSizeValues = sizeType
    ? sortSizeOrderables(
        availableOptionValues.filter((v) => v.optionTypeId === sizeType.id && (!v.isArchived || sizeValueIds.includes(v.id)))
      )
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


  const removeColorRow = (id: string) => {
    if (!colorType) return;
    const color = availableOptionValues.find((v) => v.id === id);
    const affected = value.variants.filter((v) => v.optionValueIds.includes(id));
    const hasStockOrHistory = affected.some((v) => Boolean(v.id) || v.quantity > 0);

    // A color with real inventory/order history isn't actually removable —
    // its saved variant rows stay submitted either way, so this used to
    // promise "will be archived", hide the row locally, and then have it
    // reappear on the very next save/edit with nothing having changed. Say
    // so plainly instead of offering a removal that doesn't happen: point
    // at Inventory (set stock to 0) as the real way to stop it selling.
    if (hasStockOrHistory) {
      window.alert(
        `${color?.label ?? "This color"} can't be removed — it has ${affected.length} saved variant(s) with inventory or order history, so its records have to stay. To stop it from being sold, set its size(s) to 0 stock from Inventory instead.`
      );
      return;
    }

    const message = affected.length === 0
      ? `Remove ${color?.label ?? "this color"} from the product? Its uploaded image and any sizes added later would need to be re-added.`
      : `Remove ${color?.label ?? "this color"}? It has ${affected.length} unsaved variant(s) — they will be removed. Continue?`;
    if (!window.confirm(message)) return;
    const nextValueIds = colorValueIds.filter((v) => v !== id);
    const nextVariants = affected.length === 0 ? value.variants : value.variants.filter((v) => !v.optionValueIds.includes(id));
    const nextColorImages = { ...value.colorImages };
    if (nextValueIds.length === 0 || !colorValueIds.includes(id)) delete nextColorImages[id];
    set({
      valueIdsByOptionType: { ...value.valueIdsByOptionType, [colorType.id]: nextValueIds },
      optionTypeIds: nextValueIds.length === 0 ? value.optionTypeIds.filter((t) => t !== colorType.id) : value.optionTypeIds,
      variants: nextVariants,
      colorImages: nextColorImages,
    });
  };

  // Toggling an already-added color off inside the Add Color popover itself
  // — a quiet, no-confirm shortcut, but only while the color is still
  // genuinely empty (not saved, no Variant Price, no Low Stock override).
  // The instant any of that exists, this is a no-op: the color's own "X"
  // in the table (removeColorRow, always confirms) becomes the only way to
  // remove it.
  const quickRemoveColorIfEmpty = (id: string) => {
    if (!colorType) return;
    const affected = value.variants.filter((v) => v.optionValueIds.includes(id));
    const hasData = affected.some((v) => Boolean(v.id) || v.quantity > 0 || v.variantPrice != null || v.variantDiscountPercent != null || v.lowStockThresholdOverride != null);
    if (hasData) return;
    const nextValueIds = colorValueIds.filter((v) => v !== id);
    const nextVariants = value.variants.filter((v) => !v.optionValueIds.includes(id));
    const nextColorImages = { ...value.colorImages };
    delete nextColorImages[id];
    set({
      valueIdsByOptionType: { ...value.valueIdsByOptionType, [colorType.id]: nextValueIds },
      optionTypeIds: nextValueIds.length === 0 ? value.optionTypeIds.filter((t) => t !== colorType.id) : value.optionTypeIds,
      variants: nextVariants,
      colorImages: nextColorImages,
    });
  };

  const createColorValue = async (input: NewColorInput) => {
    if (!colorType) return;
    const created = await onCreateOptionValue(colorType.id, input.label, input);
    addColorValue(created.id);
  };

  // Add Size lives inside a Color row now — it creates exactly one Variant
  // for that (color, size) combination, not a shared column across every
  // Color. sizeValueIds (the product-wide "known sizes" list, used by the
  // size picker/suggestions) is shared, but Variant existence is always
  // per-color.
  const addSizeToColor = (colorId: string, sizeId: string) => {
    if (!sizeType) return;
    const comboKey = buildComboKey([colorId, sizeId].sort());
    if (value.variants.some((v) => buildComboKey(v.optionValueIds) === comboKey)) return;
    const newRow: VariantRow = {
      optionValueIds: [colorId, sizeId],
      quantity: 0,
      sellingStatus: "active",
    };
    set({
      optionTypeIds: ensureOptionTypeActive(sizeType.id),
      valueIdsByOptionType: { ...value.valueIdsByOptionType, [sizeType.id]: sizeValueIds.includes(sizeId) ? sizeValueIds : [...sizeValueIds, sizeId] },
      variants: [...value.variants, newRow],
    });
  };

  const createSizeForColor = async (colorId: string, label: string) => {
    if (!sizeType) return;
    const created = await onCreateOptionValue(sizeType.id, label);
    addSizeToColor(colorId, created.id);
  };

  const removeVariant = (colorId: string, sizeId: string) => {
    const comboKey = buildComboKey([colorId, sizeId].sort());
    const existing = value.variants.find((v) => buildComboKey(v.optionValueIds) === comboKey);
    if (!existing) return;
    const hasData = Boolean(existing.id) || existing.variantPrice != null || existing.variantDiscountPercent != null || existing.lowStockThresholdOverride != null;
    if (hasData) {
      const message = existing.id
        ? "This variant is saved and may have inventory history. It will be archived, not deleted, when you save. Continue?"
        : "Remove this variant? It already has a Variant Price or a Low Stock override set.";
      if (!window.confirm(message)) return;
    }
    set({ variants: value.variants.filter((v) => buildComboKey(v.optionValueIds) !== comboKey) });
  };

  const updateVariant = (colorId: string, sizeId: string, patch: Partial<VariantRow>) => {
    const comboKey = buildComboKey([colorId, sizeId].sort());
    set({ variants: value.variants.map((v) => (buildComboKey(v.optionValueIds) === comboKey ? { ...v, ...patch } : v)) });
  };

  // Legacy: a product created before this rebuild may still carry a 3rd,
  // non-Color/Size option type. Preserve and keep it editable (existing
  // variants reference it), but do not offer creating a new one.
  const legacyOptionTypeIds = value.optionTypeIds.filter((id) => id !== colorType?.id && id !== sizeType?.id);

  return (
    <div className="space-y-8">
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

      {/* Variants — one unified Color-first table. Add Color, then Add Size
          inside each Color row; every Size is a real, immediately editable
          Variant row (Opening Stock/Low Stock/Variant Price inline). No
          cartesian-product generator button, no separate review table. */}
      {colorType && sizeType ? (
        <VariantTable
          colorValues={colorValues}
          availableColorValues={availableColorValues}
          availableSizeValues={availableSizeValues}
          variants={value.variants}
          colorImages={value.colorImages}
          defaultLowStockThreshold={value.defaultLowStockThreshold}
          basePrice={productPrice}
          currency={currency}
          productDiscountPercent={productDiscountPercent}
          disabled={disabled}
          taxonomyNodes={taxonomyNodes}
          productTypeId={productTypeId}
          inventoryHref={inventoryHref}
          isPartnerBrand={isPartnerBrand}
          onAddColor={addColorValue}
          onCreateColor={createColorValue}
          onRemoveColor={removeColorRow}
          onQuickRemoveColor={quickRemoveColorIfEmpty}
          onAddSizeToColor={addSizeToColor}
          onCreateSizeForColor={createSizeForColor}
          onRemoveVariant={removeVariant}
          onUpdateVariant={updateVariant}
          onReorderSize={onReorderOptionValue}
        />
      ) : optionLoadState === "idle" || optionLoadState === "loading" ? (
        <div className="flex items-center gap-3 rounded-xl border border-stone-150 bg-stone-50 px-4 py-4 text-[12.5px] text-ink-soft/70">
          <Loader2 className="h-4 w-4 animate-spin text-[#C85956]" />
          Loading colors and sizes…
        </div>
      ) : optionLoadState === "error" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-red-600" />
            <div>
              <p className="text-[12.5px] font-bold text-red-800">Colors and sizes could not be loaded</p>
              <p className="mt-0.5 text-[11.5px] text-red-700/75">{optionLoadError || "Check your connection and try again."}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRetryOptions}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-[11.5px] font-bold text-red-700 transition-colors hover:bg-red-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
          <div>
            <p className="text-[12.5px] font-bold text-amber-900">Color and Size need administrator setup</p>
            <p className="mt-0.5 text-[11.5px] text-amber-800/75">The system option types are unavailable for this workspace.</p>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-[16px] border border-[#e4dcd4] bg-[#fbf8f4]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e9e1d9] px-4 py-3.5">
          <div><p className="text-[12px] font-extrabold text-[#352e29]">Variant summary</p><p className="mt-0.5 text-[10.5px] text-[#897b71]">Updates instantly as colors and sizes change.</p></div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${attentionCount ? "bg-[#fff0eb] text-[#a24e4b]" : "bg-emerald-50 text-emerald-700"}`}>{attentionCount ? `${attentionCount} need attention` : value.variants.length ? "Ready" : "Start with a color"}</span>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-[#e9e1d9] sm:grid-cols-4 sm:divide-y-0">
          <div className="flex items-start gap-2.5 px-4 py-3.5"><Boxes className="mt-0.5 h-4 w-4 text-[#C85956]" /><div><p className="tabular-nums text-[15px] font-extrabold text-[#352e29]">{value.variants.length}</p><p className="text-[10px] text-[#897b71]">sellable combinations</p></div></div>
          <div className="flex items-start gap-2.5 px-4 py-3.5"><Tags className="mt-0.5 h-4 w-4 text-[#7a685c]" /><div><p className="tabular-nums text-[15px] font-extrabold text-[#352e29]">{colorValueIds.length} <span className="text-[10px] font-semibold text-[#897b71]">colors</span> · {sizeValueIds.length} <span className="text-[10px] font-semibold text-[#897b71]">sizes</span></p><p className="text-[10px] text-[#897b71]">option coverage</p></div></div>
          <div className="flex items-start gap-2.5 px-4 py-3.5"><PackageOpen className="mt-0.5 h-4 w-4 text-[#7a685c]" /><div><p className="tabular-nums text-[15px] font-extrabold text-[#352e29]">{activeVariants.length}</p><p className="text-[10px] text-[#897b71]">active · stock added from Inventory</p></div></div>
          <div className="flex items-start gap-2.5 px-4 py-3.5"><ImageIcon className="mt-0.5 h-4 w-4 text-[#7a685c]" /><div><p className="tabular-nums text-[15px] font-extrabold text-[#352e29]">{missingColorImages || customPricedVariants}</p><p className="text-[10px] text-[#897b71]">{missingColorImages ? "color photos missing" : `${customPricedVariants} custom prices`}</p></div></div>
        </div>
      </div>

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
