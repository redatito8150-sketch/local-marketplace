"use client";

import type { TaxonomyNode } from "@/types";
import { FASHION_FITS, isFitApplicable, recommendedFits } from "@/lib/inventory/fitProfiles";

// Single-select Fit field with taxonomy-aware option ordering (Product
// Type -> Product Group -> Main Category -> Fashion fallback — see
// lib/inventory/fitProfiles.ts). Hidden entirely for Product Types where
// Fit doesn't apply (jewelry, shoes, bags, ...). An already-selected value
// that's no longer recommended is preserved, never silently cleared —
// just flagged with a non-destructive warning.
export default function FitSelect({
  value,
  onChange,
  taxonomyNodes,
  productTypeId,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  taxonomyNodes: TaxonomyNode[];
  productTypeId: string;
  disabled?: boolean;
}) {
  if (!isFitApplicable(taxonomyNodes, productTypeId)) return null;

  const recommended = recommendedFits(taxonomyNodes, productTypeId);
  const otherFits = FASHION_FITS.filter((f) => !recommended.includes(f));
  const currentNotRecommended = Boolean(value) && !recommended.includes(value as (typeof FASHION_FITS)[number]) && FASHION_FITS.includes(value as (typeof FASHION_FITS)[number]);

  return (
    <div>
      <label className="block">
        <span className="text-[12.5px] font-medium text-ink-soft/70">Fit</span>
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30 disabled:cursor-not-allowed disabled:bg-stone-50"
        >
          <option value="">Select fit</option>
          {recommended.length > 0 && (
            <optgroup label="Recommended for this Product Type">
              {recommended.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </optgroup>
          )}
          {otherFits.length > 0 && (
            <optgroup label="Other Fashion fits">
              {otherFits.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {currentNotRecommended && (
        <p className="mt-1 text-[11.5px] text-amber-700">
          &quot;{value}&quot; isn&apos;t typically recommended for this Product Type, but your selection is kept.
        </p>
      )}
    </div>
  );
}
