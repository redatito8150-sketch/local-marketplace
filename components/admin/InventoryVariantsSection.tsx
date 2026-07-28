"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { OptionSwatchType, SellingStatus, TaxonomyNode } from "@/types";
import OptionValueMultiSelect from "./OptionValueMultiSelect";
import ColorOptionPicker, { type NewColorInput } from "./ColorOptionPicker";
import ColorSwatch from "./ColorSwatch";
import ImageUploader from "./ImageUploader";
import AllowedCombinationBuilder from "./AllowedCombinationBuilder";
import SizeValueSelector from "./SizeValueSelector";
import {
  buildComboKey,
  MAX_VARIANT_OPTIONS_PER_PRODUCT,
} from "@/lib/inventory/variantCombinations";
import {
  reconcileAllowedCombinationPool,
  validateAllowedCombinations,
  variantChangeSummary,
} from "@/lib/inventory/allowedCombinations";
import { calculateStockStatus, effectiveLowStockThreshold } from "@/lib/inventory/stockStatus";
import { calculateTotalInventory } from "@/lib/inventory/readiness";

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
  optionTypeIds: string[]; // ordered, max 3
  valueIdsByOptionType: Record<string, string[]>;
  allowedCombinations: string[][];
  variants: VariantRow[];
  colorImages: Record<string, string>; // optionValueId -> url
}

const SELLING_STATUS_OPTIONS: { value: SellingStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "discontinued", label: "Discontinued" },
];

function StockBadge({ status }: { status: "in_stock" | "low_stock" | "out_of_stock" }) {
  const map = {
    in_stock: { label: "In Stock", className: "bg-emerald-50 text-emerald-700" },
    low_stock: { label: "Low Stock", className: "bg-amber-50 text-amber-700" },
    out_of_stock: { label: "Out of Stock", className: "bg-red-50 text-red-700" },
  } as const;
  const info = map[status];
  return <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${info.className}`}>{info.label}</span>;
}

export default function InventoryVariantsSection({
  value,
  onChange,
  availableOptionTypes,
  availableOptionValues,
  onCreateOptionType,
  onCreateOptionValue,
  currency,
  productSkuPreview,
  productPrice,
  disabled,
  taxonomyNodes,
  productTypeId,
  inventoryHref,
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
}) {
  const [pendingGenerateNotice, setPendingGenerateNotice] = useState<string | null>(null);
  const [collapsedColors, setCollapsedColors] = useState<Set<string>>(new Set());

  const colorType = availableOptionTypes.find((t) => t.key === "color");
  const selectedColorTypeActive = value.optionTypeIds.includes(colorType?.id ?? "__none__");

  const set = (patch: Partial<InventoryVariantsValue>) => onChange({ ...value, ...patch });

  const toggleOptionType = (optionTypeId: string) => {
    const isSelected = value.optionTypeIds.includes(optionTypeId);
    if (isSelected) {
      const nextTypeIds = value.optionTypeIds.filter((id) => id !== optionTypeId);
      const nextValueIds = { ...value.valueIdsByOptionType };
      delete nextValueIds[optionTypeId];
      set({
        optionTypeIds: nextTypeIds,
        valueIdsByOptionType: nextValueIds,
        allowedCombinations: reconcileAllowedCombinationPool(value.allowedCombinations, nextValueIds),
      });
      return;
    }
    if (value.optionTypeIds.length >= MAX_VARIANT_OPTIONS_PER_PRODUCT) {
      setPendingGenerateNotice("A product can have a maximum of 3 variant options.");
      return;
    }
    set({ optionTypeIds: [...value.optionTypeIds, optionTypeId] });
  };

  const toggleValue = (optionTypeId: string, valueId: string) => {
    const current = value.valueIdsByOptionType[optionTypeId] ?? [];
    const next = current.includes(valueId) ? current.filter((id) => id !== valueId) : [...current, valueId];
    const nextValueIds = { ...value.valueIdsByOptionType, [optionTypeId]: next };
    set({
      valueIdsByOptionType: nextValueIds,
      allowedCombinations: reconcileAllowedCombinationPool(value.allowedCombinations, nextValueIds),
    });
  };

  const selectionsForGeneration = useMemo(
    () =>
      value.optionTypeIds.map((optionTypeId) => ({
        optionTypeId,
        valueIds: value.valueIdsByOptionType[optionTypeId] ?? [],
      })),
    [value.optionTypeIds, value.valueIdsByOptionType]
  );
  const generationResult = useMemo(
    () => validateAllowedCombinations(value.optionTypeIds, value.valueIdsByOptionType, value.allowedCombinations),
    [value.optionTypeIds, value.valueIdsByOptionType, value.allowedCombinations]
  );
  const generationSummary = useMemo(
    () => generationResult.ok
      ? variantChangeSummary(value.variants, generationResult.combinations.map((item) => item.optionValueIds))
      : null,
    [generationResult, value.variants]
  );
  const variantsUpToDate = Boolean(generationSummary) &&
    generationSummary!.created === 0 &&
    generationSummary!.removed === 0;
  const configurationComplete = value.optionTypeIds.length === 0 ||
    value.optionTypeIds.every((id) => (value.valueIdsByOptionType[id] ?? []).length > 0);
  const readyToPublish = configurationComplete &&
    value.variants.some((variant) => variant.sellingStatus === "active" && variant.quantity > 0);

  const handleGenerate = () => {
    const result = validateAllowedCombinations(
      value.optionTypeIds,
      value.valueIdsByOptionType,
      value.allowedCombinations
    );
    if (!result.ok) {
      setPendingGenerateNotice(result.error);
      return;
    }
    const summary = variantChangeSummary(value.variants, result.combinations.map((combination) => combination.optionValueIds));
    if (summary.removed > 0 && !window.confirm(
      `${summary.preserved} variants will be preserved.\n${summary.created} variants will be created.\n${summary.removed} variants will be removed or archived.\n${summary.affectedQuantity} inventory units are affected.\n\nContinue?`
    )) return;
    setPendingGenerateNotice(null);

    const existingByCombo = new Map(value.variants.map((v) => [buildComboKey(v.optionValueIds), v]));
    const nextVariants: VariantRow[] = result.combinations.map(({ optionValueIds, comboKey }) => {
      const existing = existingByCombo.get(comboKey);
      if (existing) return existing;
      return {
        optionValueIds,
        quantity: 0,
        openingStock: 0,
        sellingStatus: "active" as SellingStatus,
      };
    });
    set({ variants: nextVariants });
  };

  const updateVariant = (comboKey: string, patch: Partial<VariantRow>) => {
    set({
      variants: value.variants.map((v) => (buildComboKey(v.optionValueIds) === comboKey ? { ...v, ...patch } : v)),
    });
  };

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

  const labelFor = (valueId: string) => availableOptionValues.find((v) => v.id === valueId)?.label ?? "—";

  // Group generated variant rows by Color when Color is one of the
  // selected options — otherwise render one flat table.
  const colorValueIds = useMemo(
    () => (colorType ? value.valueIdsByOptionType[colorType.id] ?? [] : []),
    [colorType, value.valueIdsByOptionType]
  );
  const groupedByColor = useMemo(() => {
    if (!colorType || colorValueIds.length === 0) return null;
    const groups = new Map<string, VariantRow[]>();
    for (const variant of value.variants) {
      const colorId = variant.optionValueIds.find((id) => colorValueIds.includes(id));
      if (!colorId) continue;
      groups.set(colorId, [...(groups.get(colorId) ?? []), variant]);
    }
    return groups;
  }, [colorType, colorValueIds, value.variants]);

  const toggleCollapsed = (colorId: string) => {
    setCollapsedColors((prev) => {
      const next = new Set(prev);
      if (next.has(colorId)) next.delete(colorId);
      else next.add(colorId);
      return next;
    });
  };

  const renderVariantRow = (variant: VariantRow, hideColor: boolean) => {
    const comboKey = buildComboKey(variant.optionValueIds);
    const effectiveThreshold = effectiveLowStockThreshold(variant.lowStockThresholdOverride, value.defaultLowStockThreshold);
    const stockStatus = calculateStockStatus(variant.quantity, effectiveThreshold);
    const remainingLabels = variant.optionValueIds
      .filter((id) => !hideColor || !colorValueIds.includes(id))
      .map(labelFor)
      .join(" / ") || "Default";

    return (
      <tr key={comboKey || "default"}>
        <td className="px-3 py-2 text-ink">{remainingLabels}</td>
        <td className="px-3 py-2">
          {variant.sku ? (
            <code className="select-all text-[12px]">{variant.sku}</code>
          ) : (
            <span className="text-[11.5px] text-ink-soft/45">Generated after saving</span>
          )}
        </td>
        <td className="px-3 py-2">
          {variant.id ? (
            <div>
              <strong className="text-[13px]">{variant.quantity}</strong>
              <p className="text-[10.5px] text-ink-soft/50">Managed from Inventory</p>
            </div>
          ) : (
            <input
              aria-label="Opening Stock"
              type="number"
              min={0}
              step={1}
              value={variant.openingStock ?? variant.quantity}
              onChange={(e) => {
                const openingStock = Math.max(0, Math.trunc(Number(e.target.value) || 0));
                updateVariant(comboKey, { openingStock, quantity: openingStock });
              }}
              className="w-20 rounded border border-stone-150 px-2 py-1 text-[12.5px] outline-none focus:border-ink/30"
            />
          )}
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            min={0}
            placeholder={`Default (${value.defaultLowStockThreshold})`}
            value={variant.lowStockThresholdOverride ?? ""}
            onChange={(e) =>
              updateVariant(comboKey, {
                lowStockThresholdOverride: e.target.value ? Math.max(0, Number(e.target.value)) : undefined,
              })
            }
            className="w-28 rounded border border-stone-150 px-2 py-1 text-[12.5px] outline-none focus:border-ink/30"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="Product price"
            value={variant.variantPrice ?? ""}
            onChange={(e) =>
              updateVariant(comboKey, { variantPrice: e.target.value ? Number(e.target.value) : undefined })
            }
            className="w-24 rounded border border-stone-150 px-2 py-1 text-[12.5px] outline-none focus:border-ink/30"
          />
        </td>
        <td className="px-3 py-2">
          <select
            value={variant.sellingStatus}
            onChange={(e) => updateVariant(comboKey, { sellingStatus: e.target.value as SellingStatus })}
            className="rounded border border-stone-150 px-2 py-1 text-[12.5px] outline-none focus:border-ink/30"
          >
            {SELLING_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </td>
        <td className="px-3 py-2">
          <StockBadge status={stockStatus} />
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-8">
      {/* 1 — Inventory Summary */}
      <div>
        <h3 className="text-[13px] font-semibold text-ink">Inventory Summary</h3>
        <p className="mt-1 text-[12px] text-ink-soft/55">
          Set Opening Stock only when creating a new variant. After saving, all stock changes are managed from Inventory and recorded in history.
        </p>
        {inventoryHref && <a href={inventoryHref} className="mt-2 inline-flex text-[12px] font-semibold text-ink underline">Open Inventory</a>}
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
            <p className="mt-1 text-[12.5px]">{configurationComplete ? "Complete" : "Select at least one value for every option."}</p>
          </div>
          <div className={`rounded-md border px-3 py-2.5 ${readyToPublish ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide">Publishing readiness</p>
            <p className="mt-1 text-[12.5px]">{readyToPublish ? "Ready to publish" : "Needs an active variant with inventory."}</p>
          </div>
        </div>
      </div>

      {/* 2 — Default Low Stock Alert */}
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
            Applies to every variant without its own custom threshold.
          </p>
        </div>
      </div>

      {/* 3 — Variant Options */}
      <div>
        <h3 className="text-[13px] font-semibold text-ink">Variant Options</h3>
        <p className="mt-1 text-[12px] text-ink-soft/55">Up to 3 option types per product.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {availableOptionTypes.filter((type) => !type.isArchived || value.optionTypeIds.includes(type.id)).map((type) => {
            const active = value.optionTypeIds.includes(type.id);
            return (
              <button
                key={type.id}
                type="button"
                disabled={disabled}
                onClick={() => toggleOptionType(type.id)}
                aria-pressed={active}
                className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                  active ? "border-ink bg-ink text-cream" : "border-stone-200 text-ink-soft/70 hover:border-ink/40"
                }`}
              >
                {type.name}
              </button>
            );
          })}
        </div>
        <CreateOptionTypeInline onCreate={onCreateOptionType} disabled={disabled || value.optionTypeIds.length >= MAX_VARIANT_OPTIONS_PER_PRODUCT} />

        <div className="mt-4 space-y-4">
          {value.optionTypeIds.map((optionTypeId) => {
            const type = availableOptionTypes.find((t) => t.id === optionTypeId);
            if (!type) return null;
            const selectedIds = value.valueIdsByOptionType[optionTypeId] ?? [];
            const valuesForType = availableOptionValues.filter((v) => v.optionTypeId === optionTypeId && (!v.isArchived || selectedIds.includes(v.id)));

            if (type.key === "color") {
              return (
                <ColorOptionPicker
                  key={optionTypeId}
                  options={valuesForType}
                  selectedIds={selectedIds}
                  disabled={disabled}
                  onToggle={(id) => toggleValue(optionTypeId, id)}
                  onCreate={async (input) => {
                    const created = await onCreateOptionValue(optionTypeId, input.label, input);
                    toggleValue(optionTypeId, created.id);
                  }}
                />
              );
            }

            if (type.key === "size") {
              return (
                <SizeValueSelector
                  key={optionTypeId}
                  options={valuesForType}
                  selectedIds={selectedIds}
                  taxonomyNodes={taxonomyNodes}
                  productTypeId={productTypeId}
                  disabled={disabled}
                  onToggle={(id) => toggleValue(optionTypeId, id)}
                  onCreate={async (label) => {
                    const created = await onCreateOptionValue(optionTypeId, label);
                    toggleValue(optionTypeId, created.id);
                  }}
                />
              );
            }

            return (
              <OptionValueMultiSelect
                key={optionTypeId}
                label={type.name}
                options={valuesForType.map((v) => ({ id: v.id, label: v.label }))}
                selectedIds={selectedIds}
                disabled={disabled}
                onToggle={(id) => toggleValue(optionTypeId, id)}
                onCreate={async (label) => {
                  const created = await onCreateOptionValue(optionTypeId, label);
                  toggleValue(optionTypeId, created.id);
                }}
              />
            );
          })}
        </div>

        <div className="mt-5">
          <h4 className="mb-2 text-[12.5px] font-semibold text-ink">Allowed Combination Builder</h4>
          <AllowedCombinationBuilder
            groups={selectionsForGeneration.map((selection) => ({
              id: selection.optionTypeId,
              label: availableOptionTypes.find((type) => type.id === selection.optionTypeId)?.name ?? "Option",
              values: selection.valueIds.map((id) => ({
                id,
                label: availableOptionValues.find((option) => option.id === id)?.label ?? id,
              })),
            }))}
            allowed={value.allowedCombinations}
            existing={value.variants}
            onChange={(allowedCombinations) => set({ allowedCombinations })}
            disabled={disabled || !generationResult.ok || variantsUpToDate}
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={disabled}
            onClick={handleGenerate}
            className="rounded-md bg-ink px-4 py-2.5 text-[13px] font-semibold text-cream disabled:cursor-not-allowed disabled:opacity-60"
          >
            Generate Variants{value.allowedCombinations.length > 0 ? ` (${value.allowedCombinations.length})` : ""}
          </button>
          {variantsUpToDate && <span className="text-[12.5px] font-medium text-emerald-700">Variants are up to date.</span>}
          {pendingGenerateNotice && (
            <span className="text-[12.5px] font-medium text-red-600">{pendingGenerateNotice}</span>
          )}
        </div>
      </div>

      {/* 4 — Color Image Mapping */}
      {selectedColorTypeActive && colorValueIds.length > 0 && (
        <div>
          <h3 className="text-[13px] font-semibold text-ink">Color Image Mapping</h3>
          <p className="mt-1 text-[12px] text-ink-soft/55">
            One optional image per color, shared by every variant using that color.
          </p>
          <div className="mt-2 space-y-3">
            {colorValueIds.map((colorId) => {
              const colorValue = availableOptionValues.find((v) => v.id === colorId);
              if (!colorValue) return null;
              return (
                <div key={colorId} className="flex items-center gap-3 rounded-md border border-stone-150 p-3">
                  <ColorSwatch swatchType={colorValue.swatchType} primaryColor={colorValue.primaryColor} secondaryColor={colorValue.secondaryColor} size={24} />
                  <span className="w-24 shrink-0 text-[13px] font-medium text-ink">{colorValue.label}</span>
                  <div className="flex-1">
                    <ImageUploader
                      label=""
                      folderId="color-images"
                      value={value.colorImages[colorId] ? [value.colorImages[colorId]] : []}
                      onChange={(urls) => set({ colorImages: { ...value.colorImages, [colorId]: urls[0] ?? "" } })}
                      maxImages={1}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5 — Generated Variants */}
      {value.variants.length > 0 && (
        <div>
          <h3 className="text-[13px] font-semibold text-ink">Generated Variants</h3>
          <p className="mt-1 text-[12px] text-ink-soft/55">
            Variant SKU namespace: <code>{productSkuPreview}</code>
          </p>

          {groupedByColor ? (
            <div className="mt-3 space-y-3">
              {[...groupedByColor.entries()].map(([colorId, rows]) => {
                const colorValue = availableOptionValues.find((v) => v.id === colorId);
                const collapsed = collapsedColors.has(colorId);
                return (
                  <div key={colorId} className="rounded-lg border border-stone-150">
                    <button
                      type="button"
                      onClick={() => toggleCollapsed(colorId)}
                      className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left"
                    >
                      <ColorSwatch swatchType={colorValue?.swatchType} primaryColor={colorValue?.primaryColor} secondaryColor={colorValue?.secondaryColor} size={20} />
                      {value.colorImages[colorId] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={value.colorImages[colorId]} alt="" className="h-8 w-8 rounded object-cover" />
                      )}
                      <span className="text-[13px] font-semibold text-ink">{colorValue?.label ?? "—"}</span>
                      <span className="ml-auto text-[11.5px] text-ink-soft/50">{rows.length} variant{rows.length === 1 ? "" : "s"}</span>
                    </button>
                    {!collapsed && (
                      <div className="overflow-x-auto border-t border-stone-150">
                        <table className="w-full text-left text-[13px]">
                          <thead className="border-b border-stone-150 bg-stone-50 text-[11px] uppercase tracking-wide text-ink-soft/50">
                            <tr>
                              <th className="px-3 py-2 font-medium">Options</th>
                              <th className="px-3 py-2 font-medium">SKU</th>
                              <th className="px-3 py-2 font-medium">Inventory</th>
                              <th className="px-3 py-2 font-medium">Low stock</th>
                              <th className="px-3 py-2 font-medium">Variant Price</th>
                              <th className="px-3 py-2 font-medium">Selling Status</th>
                              <th className="px-3 py-2 font-medium">Stock Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-150">
                            {rows.map((variant) => renderVariantRow(variant, true))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-lg border border-stone-150">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-stone-150 bg-stone-50 text-[11px] uppercase tracking-wide text-ink-soft/50">
                  <tr>
                    <th className="px-3 py-2 font-medium">Options</th>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Inventory</th>
                    <th className="px-3 py-2 font-medium">Low stock</th>
                    <th className="px-3 py-2 font-medium">Variant Price</th>
                    <th className="px-3 py-2 font-medium">Selling Status</th>
                    <th className="px-3 py-2 font-medium">Stock Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-150">
                  {value.variants.map((variant) => renderVariantRow(variant, false))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CreateOptionTypeInline({
  onCreate,
  disabled,
}: {
  onCreate: (name: string) => Promise<OptionTypeOption>;
  disabled?: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onCreate(name.trim());
      setName("");
      setCreating(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create option type");
    } finally {
      setBusy(false);
    }
  };

  if (!creating) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setCreating(true)}
        className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink hover:underline disabled:cursor-not-allowed disabled:text-ink-soft/40"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        Create custom option type
      </button>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        type="text"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Length"
        className="w-40 rounded-md border border-stone-150 bg-white px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink/30"
      />
      <button type="button" onClick={handleCreate} disabled={busy || !name.trim()} className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-semibold text-cream disabled:opacity-50">
        Add
      </button>
      <button type="button" onClick={() => setCreating(false)} className="text-[12px] text-ink-soft/60 hover:underline">
        Cancel
      </button>
      {error && <span className="text-[12px] text-red-600">{error}</span>}
    </div>
  );
}
