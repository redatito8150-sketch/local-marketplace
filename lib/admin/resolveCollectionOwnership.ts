import { supabaseAdmin } from "@/lib/supabase/admin";

export type CollectionOwnershipResult =
  | { valid: true }
  | { valid: false; error: string };

// A submitted collectionId must belong to the SAME brand as the product
// being saved — this is the one place that gets enforced, regardless of
// what the client claims. Absent collectionId is always valid (the field
// is optional).
export async function resolveCollectionOwnership(
  collectionId: string | null | undefined,
  brandSlug: string | null | undefined
): Promise<CollectionOwnershipResult> {
  if (!collectionId) return { valid: true };
  if (!brandSlug) {
    return { valid: false, error: "A collection can only be assigned once a brand is selected" };
  }

  const { data: collection } = await supabaseAdmin
    .from("collections")
    .select("id, brand_slug")
    .eq("id", collectionId)
    .maybeSingle();

  if (!collection || collection.brand_slug !== brandSlug) {
    return { valid: false, error: "The selected collection does not belong to this product's brand" };
  }

  return { valid: true };
}
