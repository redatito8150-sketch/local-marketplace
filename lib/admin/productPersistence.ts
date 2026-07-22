import type { ProductInput } from "@/lib/admin/productValidation";
import type { ProductColorOption } from "@/types";

export interface LegacyProductFields {
  colors: ProductColorOption[];
  sizes: string[];
  unavailableSizes: string[];
  inStock: boolean;
}

export function buildProductPersistencePayload(
  body: ProductInput,
  legacy: LegacyProductFields,
  overrides?: {
    brandSlug?: string | null;
    status?: ProductInput["status"];
    publishDate?: string | null;
    submittedBy?: string | null;
    clearReviewState?: boolean;
  }
) {
  const payload: Record<string, unknown> = {
    name: body.name,
    brand_name: body.brandName,
    brand_slug: overrides?.brandSlug ?? body.brandSlug ?? null,
    category: body.category || null,
    product_category: body.productCategory || null,
    product_type: body.productType || null,
    collection: body.collection || null,
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
    sku: body.sku?.trim(),
    in_stock: legacy.inStock,
    is_new: body.isNew,
    is_unisex: body.isUnisex,
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
