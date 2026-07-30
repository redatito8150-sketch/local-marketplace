// Grouped system Material catalog for the Materials composer
// (components/admin/MaterialsComposer.tsx). Same values as the legacy flat
// MATERIALS list in content/productTaxonomy.ts (kept there, untouched, for
// backward compatibility) — just organized into browsable groups.
export interface MaterialGroup {
  group: string;
  options: string[];
}

export const MATERIAL_GROUPS: MaterialGroup[] = [
  { group: "Natural fibers", options: ["Cotton", "Linen", "Silk", "Wool", "Cashmere"] },
  { group: "Synthetic fibers", options: ["Polyester", "Viscose"] },
  { group: "Leather & denim", options: ["Leather", "Denim"] },
];

export const ALL_MATERIALS: string[] = MATERIAL_GROUPS.flatMap((g) => g.options);
