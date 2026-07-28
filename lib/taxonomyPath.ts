import type { TaxonomyNode } from "@/types";

// Pure resolution logic, split out from lib/data/taxonomy.ts (which fetches
// the tree from Supabase) so this specific logic is directly unit-testable
// under Node's native test runner without a `@/lib/supabase/client` import
// at module scope — same "DB-fetching split from pure logic" precedent as
// lib/admin/resolveTaxonomyLeaf.ts / lib/admin/taxonomyChainValidation.ts.

export interface TaxonomyPath {
  mainCategory: string;
  productGroup: string;
  productTypeName: string;
}

// Resolves a Level 3 (Product Type) node id to its full display path by
// walking parent_id up an already-loaded tree — products only ever store
// the Level 3 id, never the Main Category/Product Group names redundantly,
// so every read path that needs to *display* "Main Category / Product
// Group / Product Type" goes through this instead of a second stored
// column.
export function resolveTaxonomyPath(
  tree: TaxonomyNode[],
  productTypeId: string | null | undefined
): TaxonomyPath | null {
  if (!productTypeId) return null;
  const byId = new Map(tree.map((node) => [node.id, node]));
  const type = byId.get(productTypeId);
  if (!type || type.level !== 3 || !type.parentId) return null;
  const group = byId.get(type.parentId);
  if (!group || group.level !== 2 || !group.parentId) return null;
  const main = byId.get(group.parentId);
  if (!main || main.level !== 1) return null;
  return { mainCategory: main.name, productGroup: group.name, productTypeName: type.name };
}
