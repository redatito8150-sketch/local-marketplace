import { buildComboKey, MAX_VARIANTS_PER_PRODUCT } from "./variantCombinations.ts";

export interface AllowedCombination {
  optionValueIds: string[];
  comboKey: string;
}

export type AllowedCombinationValidation =
  | { ok: true; combinations: AllowedCombination[] }
  | { ok: false; error: string };

export function normalizeAllowedCombinations(combinations: string[][]): AllowedCombination[] {
  const unique = new Map<string, AllowedCombination>();
  for (const optionValueIds of combinations) {
    const ids = [...new Set(optionValueIds.filter(Boolean))];
    const comboKey = buildComboKey(ids);
    if (!unique.has(comboKey)) unique.set(comboKey, { optionValueIds: ids, comboKey });
  }
  return [...unique.values()];
}

export function validateAllowedCombinations(
  optionTypeIds: string[],
  valueIdsByOptionType: Record<string, string[]>,
  combinations: string[][]
): AllowedCombinationValidation {
  if (optionTypeIds.length === 0) {
    return { ok: true, combinations: [{ optionValueIds: [], comboKey: "" }] };
  }
  if (combinations.length === 0) {
    return { ok: false, error: "No valid variant combinations selected." };
  }

  const valueToType = new Map<string, string>();
  for (const optionTypeId of optionTypeIds) {
    const ids = valueIdsByOptionType[optionTypeId] ?? [];
    if (ids.length === 0) {
      return { ok: false, error: "Each selected option needs at least one value." };
    }
    for (const id of ids) valueToType.set(id, optionTypeId);
  }

  const normalized = normalizeAllowedCombinations(combinations);
  if (normalized.length > MAX_VARIANTS_PER_PRODUCT) {
    return { ok: false, error: "A product can have a maximum of 200 variants." };
  }
  if (normalized.length !== combinations.length) {
    return { ok: false, error: "Remove invalid combinations before generating variants." };
  }
  for (const combination of normalized) {
    if (combination.optionValueIds.length !== optionTypeIds.length) {
      return { ok: false, error: "Remove invalid combinations before generating variants." };
    }
    const represented = new Set(combination.optionValueIds.map((id) => valueToType.get(id)));
    if (
      represented.has(undefined) ||
      represented.size !== optionTypeIds.length ||
      optionTypeIds.some((id) => !represented.has(id))
    ) {
      return { ok: false, error: "Remove invalid combinations before generating variants." };
    }
  }
  return { ok: true, combinations: normalized };
}

export function reconcileAllowedCombinationPool(
  current: string[][],
  valueIdsByOptionType: Record<string, string[]>
): string[][] {
  const available = new Set(Object.values(valueIdsByOptionType).flat());
  return current.filter((combination) => combination.every((id) => available.has(id)));
}

export function variantChangeSummary(
  existing: { optionValueIds: string[]; quantity?: number }[],
  allowed: string[][]
) {
  const existingByKey = new Map(existing.map((variant) => [buildComboKey(variant.optionValueIds), variant]));
  const allowedKeys = new Set(allowed.map(buildComboKey));
  const preserved = [...allowedKeys].filter((key) => existingByKey.has(key)).length;
  const created = allowedKeys.size - preserved;
  const removed = [...existingByKey.keys()].filter((key) => !allowedKeys.has(key));
  return {
    preserved,
    created,
    removed: removed.length,
    affectedQuantity: removed.reduce((sum, key) => sum + (existingByKey.get(key)?.quantity ?? 0), 0),
  };
}
