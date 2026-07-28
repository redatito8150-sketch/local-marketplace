import type { ProductInput } from "@/lib/admin/productValidation";
import type { Audience, ProductColorOption } from "@/types";

export interface LegacyProductFields {
  colors: ProductColorOption[];
  sizes: string[];
  unavailableSizes: string[];
  inStock: boolean;
}

// The one place Audience gets mapped onto the pre-existing category
// ('women'|'men'|'kids') + is_unisex columns that /shop/women|men|kids
// routing, filters, and every existing display already depend on — so
// none of that needs to change. 'unisex' picks 'women' as an arbitrary
// base category (matching the pre-existing is_unisex convention, which
// already meant "shown under both women and men" regardless of which of
// the two it was nominally stored under).
export function deriveCategoryFromAudience(
  audience: Audience | null | undefined
): { category: "women" | "men" | "kids" | null; isUnisex: boolean } {
  switch (audience) {
    case "men":
      return { category: "men", isUnisex: false };
    case "women":
      return { category: "women", isUnisex: false };
    case "unisex":
      return { category: "women", isUnisex: true };
    case "kids_baby":
      return { category: "kids", isUnisex: false };
    default:
      return { category: null, isUnisex: false };
  }
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
    audience: body.audience || null,
    product_category: body.productCategory || null,
    product_type: body.productType || null,
    product_type_id: body.productTypeId || null,
    collection: body.collection || null,
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
