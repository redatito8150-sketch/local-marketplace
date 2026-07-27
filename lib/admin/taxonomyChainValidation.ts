// Pure validation of an already-fetched Product Type -> Product Group ->
// Main Category chain — split out from resolveTaxonomyLeaf.ts (which does
// the actual DB fetching) so this specific rule set is directly testable
// without a database connection.
export interface TaxonomyChainRow {
  id: string;
  parent_id: string | null;
  level: number;
  is_active: boolean;
  name: string;
}

export type TaxonomyResolution =
  | { valid: true; productTypeId?: string; productCategory?: string; productType?: string }
  | { valid: false; error: string };

export function validateTaxonomyChain(
  leaf: TaxonomyChainRow | null,
  group: TaxonomyChainRow | null,
  mainCategory: TaxonomyChainRow | null
): TaxonomyResolution {
  if (!leaf || leaf.level !== 3 || !leaf.is_active) {
    return { valid: false, error: "Invalid product type selection" };
  }
  // group.id !== leaf.parent_id (and the equivalent check below) guard
  // against "Product Type that belongs to another Product Group" even if a
  // future caller ever passes mismatched rows in.
  if (!group || group.level !== 2 || !group.is_active || group.id !== leaf.parent_id) {
    return { valid: false, error: "Invalid product group for the selected product type" };
  }
  if (
    !mainCategory ||
    mainCategory.level !== 1 ||
    !mainCategory.is_active ||
    mainCategory.id !== group.parent_id
  ) {
    return { valid: false, error: "Invalid main category for the selected product type" };
  }
  return {
    valid: true,
    productTypeId: leaf.id,
    productCategory: mainCategory.name,
    productType: leaf.name,
  };
}
