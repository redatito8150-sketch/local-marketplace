import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  validateTaxonomyChain,
  type TaxonomyChainRow,
  type TaxonomyResolution,
} from "./taxonomyChainValidation.ts";

export type { TaxonomyResolution };

async function loadNode(id: string): Promise<TaxonomyChainRow | null> {
  const { data } = await supabaseAdmin
    .from("taxonomy_nodes")
    .select("id, parent_id, level, is_active, name")
    .eq("id", id)
    .maybeSingle();
  return (data as TaxonomyChainRow | null) ?? null;
}

// The one place a submitted `productTypeId` gets trusted: walks the leaf up
// to its Product Group and Main Category, verifying every step is a real,
// active node at the expected level (validateTaxonomyChain). Returns the
// *server-resolved* category/type names so the caller never has to trust
// whatever text the client also sent alongside the id.
//
// No `productTypeId` at all (an existing product whose category predates
// the new taxonomy, or a category not seeded into it yet) is a valid,
// no-op result — the caller keeps whatever productCategory/productType
// text was already on the product.
export async function resolveTaxonomyLeaf(
  productTypeId: string | null | undefined
): Promise<TaxonomyResolution> {
  if (!productTypeId) return { valid: true };

  const leaf = await loadNode(productTypeId);
  const group = leaf?.parent_id ? await loadNode(leaf.parent_id) : null;
  const mainCategory = group?.parent_id ? await loadNode(group.parent_id) : null;

  return validateTaxonomyChain(leaf, group, mainCategory);
}
