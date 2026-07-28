import type { ProductInput } from "@/lib/admin/productValidation";
import type { ProductColorOption } from "@/types";

export interface LegacyProductFields {
  colors: ProductColorOption[];
  sizes: string[];
  unavailableSizes: string[];
  inStock: boolean;
}

// Builds the products row payload for an INSERT. brand_id is included here
// (an insert always sets it once) — never call this for an UPDATE and pass
// the result straight through, since a product's brand must never change
// after creation. The update path (replace_product_with_variants RPC)
// structurally excludes brand_id/brand_slug/brand_name/sku from its SET
// list, so those columns are safe from this payload even if accidentally
// included.
export function buildProductPersistencePayload(
  body: ProductInput,
  legacy: LegacyProductFields,
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
    material: body.material || null,
    fit: body.fit || null,
    price: body.price,
    compare_at_price: body.compareAtPrice ?? null,
    currency: body.currency,
    image: body.image,
    images: body.images?.length ? body.images : [body.image],
    colors: legacy.colors,
    sizes: legacy.sizes,
    description: body.description,
    details: body.details,
    care_instructions: body.careInstructions,
    shipping_returns: body.shippingReturns,
    model_height: body.modelHeight || null,
    model_wearing: body.modelWearing || null,
    in_stock: legacy.inStock,
    is_new: body.isNew,
    unavailable_sizes: legacy.unavailableSizes,
    track_inventory: body.trackInventory,
    featured: body.featured,
    status: overrides?.status ?? body.status,
    publish_date: overrides?.publishDate ?? body.publishDate ?? null,
  };

  if (overrides?.submittedBy !== undefined) {
    payload.submitted_by = overrides.submittedBy;
  }
  if (overrides?.clearReviewState) {
    payload.pending_changes = null;
    payload.review_notes = null;
  }

  return payload;
}

export function buildVariantPersistencePayload(body: ProductInput) {
  return body.variants.map((variant) => ({
    color: variant.color || null,
    size: variant.size || null,
    sku: variant.sku?.trim() || null,
    quantity: variant.quantity,
    low_stock_threshold: variant.lowStockThreshold,
    price_override: variant.priceOverride ?? null,
    availability_status: variant.availabilityStatus,
  }));
}
