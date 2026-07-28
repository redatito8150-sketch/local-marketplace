// Cartesian-product variant generation, shared by the server (source of
// truth) and the admin form (live preview of the expected count before
// saving).

export const MAX_VARIANT_OPTIONS_PER_PRODUCT = 3;
export const MAX_VARIANTS_PER_PRODUCT = 200;

export interface OptionSelectionForGeneration {
  optionTypeId: string;
  valueIds: string[];
}

export interface VariantCombination {
  optionValueIds: string[];
  comboKey: string;
}

// Deterministic key over a variant's option value ids — order-independent
// (sorted), so the same combination always produces the same key
// regardless of which order the options were selected/submitted in. Empty
// array -> "" (the one default variant for a product with no options).
export function buildComboKey(optionValueIds: string[]): string {
  return [...optionValueIds].sort().join(",");
}

export function calculateVariantCombinationCount(
  selections: OptionSelectionForGeneration[]
): number {
  if (selections.length === 0) return 1;
  return selections.reduce((total, selection) => total * Math.max(selection.valueIds.length, 0), 1);
}

export type GenerateVariantCombinationsResult =
  | { ok: true; combinations: VariantCombination[] }
  | { ok: false; error: string; total: number };

export function generateVariantCombinations(
  selections: OptionSelectionForGeneration[]
): GenerateVariantCombinationsResult {
  if (selections.length > MAX_VARIANT_OPTIONS_PER_PRODUCT) {
    return {
      ok: false,
      error: "A product can have a maximum of 3 variant options.",
      total: calculateVariantCombinationCount(selections),
    };
  }

  const total = calculateVariantCombinationCount(selections);
  if (total > MAX_VARIANTS_PER_PRODUCT) {
    return {
      ok: false,
      error: `This selection would generate ${total} variants, which exceeds the maximum of ${MAX_VARIANTS_PER_PRODUCT}. Reduce the number of options or values.`,
      total,
    };
  }
  if (total === 0) {
    return {
      ok: false,
      error: "Every selected option needs at least one value before variants can be generated.",
      total,
    };
  }

  if (selections.length === 0) {
    return { ok: true, combinations: [{ optionValueIds: [], comboKey: "" }] };
  }

  let combos: string[][] = [[]];
  for (const selection of selections) {
    const next: string[][] = [];
    for (const combo of combos) {
      for (const valueId of selection.valueIds) {
        next.push([...combo, valueId]);
      }
    }
    combos = next;
  }

  return {
    ok: true,
    combinations: combos.map((optionValueIds) => ({
      optionValueIds,
      comboKey: buildComboKey(optionValueIds),
    })),
  };
}
