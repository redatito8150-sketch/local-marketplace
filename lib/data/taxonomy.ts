import { supabase } from "@/lib/supabase/client";
import type { TaxonomyLevel, TaxonomyNode } from "@/types";

interface TaxonomyNodeRow {
  id: string;
  parent_id: string | null;
  level: number;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
}

function toTaxonomyNode(row: TaxonomyNodeRow): TaxonomyNode {
  return {
    id: row.id,
    parentId: row.parent_id,
    level: row.level as TaxonomyLevel,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

// The full active taxonomy tree, flat — ordered so level-1 nodes come
// first, then level-2, then level-3, and siblings stay in their configured
// sort_order. Small enough (well under 200 rows even with several Main
// Categories seeded) to load in one query and filter by parentId
// client-side rather than resolving a nested tree server-side.
export async function getTaxonomyTree(): Promise<TaxonomyNode[]> {
  const { data, error } = await supabase
    .from("taxonomy_nodes")
    .select("id, parent_id, level, name, slug, sort_order, is_active")
    .eq("is_active", true)
    .order("level", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`getTaxonomyTree failed: ${error.message}`);
  return ((data as TaxonomyNodeRow[] | null) ?? []).map(toTaxonomyNode);
}
