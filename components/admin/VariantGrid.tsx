"use client";

import type { VariantInput } from "@/lib/admin/productValidation";
import type { VariantAvailabilityStatus } from "@/types";

const AVAILABILITY_OPTIONS: VariantAvailabilityStatus[] = [
  "available",
  "unavailable",
  "discontinued",
];

export default function VariantGrid({
  variants,
  onChange,
}: {
  variants: VariantInput[];
  onChange: (variants: VariantInput[]) => void;
}) {
  const update = (index: number, patch: Partial<VariantInput>) => {
    onChange(variants.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  };

  if (variants.length === 0) return null;

  const totalQuantity = variants.reduce((sum, v) => sum + (v.quantity || 0), 0);

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-stone-150">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-stone-150 bg-stone-50 text-[11px] uppercase tracking-wide text-ink-soft/50">
            <tr>
              <th className="px-3 py-2 font-medium">Color</th>
              <th className="px-3 py-2 font-medium">Size</th>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Qty</th>
              <th className="px-3 py-2 font-medium">Low stock</th>
              <th className="px-3 py-2 font-medium">Price override</th>
              <th className="px-3 py-2 font-medium">Availability</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-150">
            {variants.map((variant, i) => (
              <tr key={`${variant.color ?? "none"}-${variant.size ?? "none"}`}>
                <td className="px-3 py-2 text-ink">{variant.color || "—"}</td>
                <td className="px-3 py-2 text-ink">{variant.size || "—"}</td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={variant.sku ?? ""}
                    onChange={(e) => update(i, { sku: e.target.value })}
                    placeholder="Auto"
                    className="w-24 rounded border border-stone-150 px-2 py-1 text-[12.5px] outline-none focus:border-ink/30"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    value={variant.quantity}
                    onChange={(e) =>
                      update(i, { quantity: Math.max(0, Number(e.target.value)) })
                    }
                    className="w-16 rounded border border-stone-150 px-2 py-1 text-[12.5px] outline-none focus:border-ink/30"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    value={variant.lowStockThreshold}
                    onChange={(e) =>
                      update(i, { lowStockThreshold: Math.max(0, Number(e.target.value)) })
                    }
                    className="w-16 rounded border border-stone-150 px-2 py-1 text-[12.5px] outline-none focus:border-ink/30"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={variant.priceOverride ?? ""}
                    onChange={(e) =>
                      update(i, {
                        priceOverride: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    placeholder="—"
                    className="w-20 rounded border border-stone-150 px-2 py-1 text-[12.5px] outline-none focus:border-ink/30"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={variant.availabilityStatus}
                    onChange={(e) =>
                      update(i, {
                        availabilityStatus: e.target.value as VariantAvailabilityStatus,
                      })
                    }
                    className="rounded border border-stone-150 px-2 py-1 text-[12.5px] outline-none focus:border-ink/30"
                  >
                    {AVAILABILITY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12px] text-ink-soft/50">
        Total quantity across all variants: <span className="font-medium text-ink">{totalQuantity}</span>
      </p>
    </div>
  );
}
