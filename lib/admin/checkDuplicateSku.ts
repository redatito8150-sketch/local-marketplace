import { supabaseAdmin } from "@/lib/supabase/admin";
import type { VariantInput } from "./productValidation";

// Checks the product's own SKU and every variant SKU being submitted
// against every other product/variant in the catalog. `excludeProductId`
// is the product being edited (so its own resubmitted SKUs, and its own
// existing variant rows about to be replaced, don't flag as conflicts
// with themselves).
export async function findDuplicateSku(
  productSku: string | undefined,
  variants: VariantInput[],
  excludeProductId?: string
): Promise<string | null> {
  const candidateSkus = [
    ...(productSku ? [productSku] : []),
    ...variants.map((v) => v.sku).filter((s): s is string => Boolean(s && s.trim())),
  ];
  if (candidateSkus.length === 0) return null;

  const [productMatches, variantMatches] = await Promise.all([
    supabaseAdmin.from("products").select("id, sku").in("sku", candidateSkus),
    supabaseAdmin.from("product_variants").select("id, product_id, sku").in("sku", candidateSkus),
  ]);

  if (productMatches.error) {
    throw new Error(`SKU check failed: ${productMatches.error.message}`);
  }
  if (variantMatches.error) {
    throw new Error(`SKU check failed: ${variantMatches.error.message}`);
  }

  const conflictingProduct = (productMatches.data ?? []).find((p) => p.id !== excludeProductId);
  if (conflictingProduct) return conflictingProduct.sku;

  const conflictingVariant = (variantMatches.data ?? []).find(
    (v) => v.product_id !== excludeProductId
  );
  if (conflictingVariant) return conflictingVariant.sku;

  return null;
}
