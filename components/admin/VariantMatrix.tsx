"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, Check, MoreVertical, X } from "lucide-react";
import type { TaxonomyNode } from "@/types";
import type { OptionValueOption, VariantRow } from "./InventoryVariantsSection";
import ColorSwatch from "./ColorSwatch";
import ColorOptionPicker, { type NewColorInput } from "./ColorOptionPicker";
import SizeValueSelector from "./SizeValueSelector";
import ImageUploader from "./ImageUploader";
import { buildComboKey } from "@/lib/inventory/variantCombinations";

export type MatrixCellState = "not_created" | "draft_unsaved" | "saved_draft" | "published" | "out_of_stock";

function cellState(variant: VariantRow | undefined, productPublished: boolean): MatrixCellState {
  if (!variant) return "not_created";
  if (!variant.id) return "draft_unsaved";
  if (!productPublished) return "saved_draft";
  if (variant.quantity <= 0) return "out_of_stock";
  return "published";
}

function CellIcon({ state }: { state: MatrixCellState }) {
  switch (state) {
    case "not_created":
      return <Plus className="h-4 w-4 text-ink-soft/40" strokeWidth={2} />;
    case "draft_unsaved":
      return <Check className="h-4 w-4 text-amber-600" strokeWidth={2.5} />;
    case "saved_draft":
      return <Check className="h-4 w-4 text-blue-600" strokeWidth={2.5} />;
    case "published":
      return <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />;
    case "out_of_stock":
      return (
        <span className="relative inline-flex">
          <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-600" />
        </span>
      );
  }
}

const CELL_STATE_LABEL: Record<MatrixCellState, string> = {
  not_created: "Not Created",
  draft_unsaved: "Draft (Unsaved)",
  saved_draft: "Saved Draft",
  published: "Published / Available",
  out_of_stock: "Out of Stock",
};

function Popover({
  trigger,
  children,
  align = "left",
}: {
  trigger: (open: () => void) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="relative inline-block" ref={ref}>
      {trigger(() => setOpen(true))}
      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            className={`absolute z-50 mt-2 w-[320px] rounded-lg border border-stone-200 bg-white p-3.5 shadow-xl ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {children(() => setOpen(false))}
          </div>
        </>
      )}
    </div>
  );
}

export default function VariantMatrix({
  colorValues,
  sizeValues,
  availableColorValues,
  availableSizeValues,
  variants,
  colorImages,
  productPublished,
  disabled,
  taxonomyNodes,
  productTypeId,
  onAddColor,
  onCreateColor,
  onRemoveColor,
  onAddSize,
  onCreateSize,
  onRemoveSize,
  onChangeColorImage,
  onCellClick,
}: {
  colorValues: OptionValueOption[];
  sizeValues: OptionValueOption[];
  availableColorValues: OptionValueOption[];
  availableSizeValues: OptionValueOption[];
  variants: VariantRow[];
  colorImages: Record<string, string>;
  productPublished: boolean;
  disabled?: boolean;
  taxonomyNodes: TaxonomyNode[];
  productTypeId: string;
  onAddColor: (id: string) => void;
  onCreateColor: (input: NewColorInput) => Promise<void> | void;
  onRemoveColor: (id: string) => void;
  onAddSize: (id: string) => void;
  onCreateSize: (label: string) => Promise<void>;
  onRemoveSize: (id: string) => void;
  onChangeColorImage: (colorId: string, url: string) => void;
  onCellClick?: (colorId: string, sizeId: string, existing: VariantRow | undefined) => void;
}) {
  const variantByCombo = useMemo(() => {
    const map = new Map<string, VariantRow>();
    for (const v of variants) map.set(buildComboKey(v.optionValueIds), v);
    return map;
  }, [variants]);

  const isMultiColor = colorValues.length >= 2;
  const colorsMissingImages = isMultiColor ? colorValues.filter((c) => !colorImages[c.id]) : [];

  const cellFor = (colorId: string, sizeId: string) => {
    const key = buildComboKey([colorId, sizeId].sort());
    return variantByCombo.get(key);
  };

  const isEmpty = colorValues.length === 0 && sizeValues.length === 0;

  return (
    <div>
      <h3 className="text-[13px] font-semibold text-ink">Variants (Matrix)</h3>
      <p className="mt-1 text-[12px] text-ink-soft/55">
        Create the variants that will be available for this product. Add opening stock and price for each variant.
      </p>

      {colorsMissingImages.length > 0 && (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          This product has multiple colors. Add a primary image for each color before publishing:{" "}
          <strong>{colorsMissingImages.map((c) => c.label).join(", ")}</strong>.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
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
                onCreate={async (input) => {
                  await onCreateColor(input);
                }}
              />
              <button type="button" onClick={close} className="mt-3 text-[12px] font-semibold text-ink-soft/60 hover:underline">
                Done
              </button>
            </div>
          )}
        </Popover>

        <Popover
          trigger={(open) => (
            <button
              type="button"
              disabled={disabled}
              onClick={open}
              className="flex items-center gap-1.5 rounded-md border border-stone-200 px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              Add Size
            </button>
          )}
          align="left"
        >
          {(close) => (
            <div className="w-[360px]">
              <p className="mb-2 text-[12px] font-semibold text-ink">Add a Size</p>
              <SizeValueSelector
                options={availableSizeValues}
                selectedIds={sizeValues.map((v) => v.id)}
                taxonomyNodes={taxonomyNodes}
                productTypeId={productTypeId}
                onToggle={(id) => {
                  if (sizeValues.some((v) => v.id === id)) return;
                  onAddSize(id);
                }}
                onCreate={onCreateSize}
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
          <div className="mb-3 grid grid-cols-3 gap-1 opacity-30">
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className="h-3 w-3 rounded-sm bg-ink" />
            ))}
          </div>
          <p className="text-[13.5px] font-semibold text-ink">No colors or sizes added yet</p>
          <p className="mt-1 text-[12px] text-ink-soft/55">Add at least one color and one size to start creating your product variants.</p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-stone-150">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-stone-150 bg-stone-50">
                <th className="min-w-[160px] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft/50">
                  Color / Size
                </th>
                {sizeValues.map((size) => (
                  <th key={size.id} className="px-3 py-2.5 text-center text-[12px] font-semibold text-ink">
                    <div className="flex items-center justify-center gap-1">
                      {size.label}
                      <button
                        type="button"
                        aria-label={`Remove ${size.label} column`}
                        disabled={disabled}
                        onClick={() => onRemoveSize(size.id)}
                        className="rounded p-0.5 text-ink-soft/30 hover:text-red-600 disabled:cursor-not-allowed"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </th>
                ))}
                {sizeValues.length === 0 && (
                  <th className="px-3 py-2.5 text-center text-[12px] italic text-ink-soft/40">No sizes added yet</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-150">
              {colorValues.map((color) => (
                <tr key={color.id}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <ColorSwatch swatchType={color.swatchType} primaryColor={color.primaryColor} secondaryColor={color.secondaryColor} size={22} />
                      {colorImages[color.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={colorImages[color.id]} alt="" className="h-7 w-7 rounded object-cover" />
                      ) : (
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded border text-[9px] font-semibold ${
                            isMultiColor ? "border-amber-300 bg-amber-50 text-amber-700" : "border-dashed border-stone-200 text-ink-soft/30"
                          }`}
                        >
                          {isMultiColor ? "!" : "—"}
                        </span>
                      )}
                      <span className="text-[13px] font-medium text-ink">{color.label}</span>
                      <ColorRowMenu
                        colorId={color.id}
                        currentImage={colorImages[color.id]}
                        onChangeImage={(url) => onChangeColorImage(color.id, url)}
                        onRemove={() => onRemoveColor(color.id)}
                        disabled={disabled}
                      />
                    </div>
                  </td>
                  {sizeValues.map((size) => {
                    const existing = cellFor(color.id, size.id);
                    const state = cellState(existing, productPublished);
                    return (
                      <td key={size.id} className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onCellClick?.(color.id, size.id, existing)}
                          aria-label={
                            existing
                              ? `Edit ${color.label} / ${size.label} variant — ${CELL_STATE_LABEL[state]}`
                              : `Create ${color.label} / ${size.label} Variant`
                          }
                          title={existing ? CELL_STATE_LABEL[state] : "Create Variant"}
                          className="mx-auto flex h-8 w-8 items-center justify-center rounded-md border border-stone-150 hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <CellIcon state={state} />
                        </button>
                      </td>
                    );
                  })}
                  {sizeValues.length === 0 && <td className="px-3 py-2.5 text-center text-ink-soft/30">—</td>}
                </tr>
              ))}
              {colorValues.length === 0 && sizeValues.length > 0 && (
                <tr>
                  <td className="px-3 py-2.5 italic text-ink-soft/40" colSpan={1 + sizeValues.length}>
                    No colors added yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-soft/55">
        <Legend icon={<CellIcon state="not_created" />} label="Not Created" />
        <Legend icon={<CellIcon state="draft_unsaved" />} label="Draft (Unsaved)" />
        <Legend icon={<CellIcon state="saved_draft" />} label="Saved Draft" />
        <Legend icon={<CellIcon state="published" />} label="Published / Available" />
        <Legend icon={<CellIcon state="out_of_stock" />} label="Out of Stock" />
      </div>
    </div>
  );
}

function Legend({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1">
      {icon}
      {label}
    </span>
  );
}

function ColorRowMenu({
  colorId,
  currentImage,
  onChangeImage,
  onRemove,
  disabled,
}: {
  colorId: string;
  currentImage?: string;
  onChangeImage: (url: string) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <Popover
      align="right"
      trigger={(open) => (
        <button
          type="button"
          disabled={disabled}
          onClick={open}
          aria-label={`${colorId} color actions`}
          className="ml-auto rounded p-1 text-ink-soft/40 hover:bg-stone-100 hover:text-ink disabled:cursor-not-allowed"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      )}
    >
      {() => (
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-[11.5px] font-semibold text-ink">Color Image</p>
            <ImageUploader
              label=""
              folderId="color-images"
              value={currentImage ? [currentImage] : []}
              onChange={(urls) => onChangeImage(urls[0] ?? "")}
              maxImages={1}
            />
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="w-full rounded-md border border-red-200 px-3 py-1.5 text-[12px] font-semibold text-red-600 hover:bg-red-50"
          >
            Remove Color from Product
          </button>
        </div>
      )}
    </Popover>
  );
}
