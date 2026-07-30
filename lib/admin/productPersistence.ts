import type { ProductInput } from "@/lib/admin/productValidation";

// Builds the products row payload (product-level fields only — variants
// and their option selections are persisted separately via
// lib/admin/variantPersistence.ts, since they need their own diff/
// reconciliation logic, not a plain insert/update).
export function buildProductPersistencePayload(
  body: ProductInput,
  overrides?: {
    status?: ProductInput["status"];
    publishDate?: string | null;
    submittedBy?: string | null;
    clearReviewState?: boolean;
  }
) {
  const payload: Record<string, unknown> = {
    name: body.name,
    brand_id: body.brandId,
    audience: body.audience,
    product_type_id: body.productTypeId,
    collection_id: body.collectionId || null,
    fit: body.fit || null,
    // Structured multi-material composition — always sent (defaults to
    // empty), replacing the legacy single `material` text column below.
    materials: body.materials ?? [],
    price: body.price,
    compare_at_price: body.compareAtPrice ?? null,
    currency: body.currency,
    image: body.image,
    // One authoritative product-detail order. The cover is always present,
    // followed by merchant-ordered gallery images and then any mapped Color
    // image not already represented by the same stable URL. The real limits
    // (1 cover, up to 3 gallery, 1 per color) are enforced by the editor's
    // ImageUploader instances; this is only a generous safety backstop.
    images: [...new Set([body.image, ...(body.images ?? []), ...Object.values(body.colorImages ?? {})].filter(Boolean))].slice(0, 50),
    description: body.description,
    details: body.details,
    care_instructions: body.careInstructions,
    model_height: body.modelHeight || null,
    model_wearing: body.modelWearing || null,
    is_new: body.isNew,
    featured: body.featured,
    status: overrides?.status ?? body.status,
    publish_date: overrides?.publishDate ?? body.publishDate ?? null,
    default_low_stock_threshold: body.defaultLowStockThreshold,
  };

  // Legacy single-material text and the old per-product Shipping & Returns
  // text are never written by the current editor (materials/shippingReturns
  // above replaced them) — only include them if some other caller actually
  // provides a value, so an ordinary save never silently blanks out
  // pre-existing legacy data on an old product.
  if (body.material !== undefined) payload.material = body.material || null;
  if (body.shippingReturns !== undefined) payload.shipping_returns = body.shippingReturns;

  if (overrides?.submittedBy !== undefined) {
    payload.submitted_by = overrides.submittedBy;
  }
  if (overrides?.clearReviewState) {
    payload.pending_changes = null;
    payload.review_notes = null;
  }

  return payload;
}
