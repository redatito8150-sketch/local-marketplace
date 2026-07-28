import type { Audience, ProductColorOption, ProductStatus, SellingStatus } from "@/types";
import { MAX_VARIANT_OPTIONS_PER_PRODUCT } from "../inventory/variantCombinations.ts";
import { validateAllowedCombinations } from "../inventory/allowedCombinations.ts";

const VALID_AUDIENCES: Audience[] = ["men", "women", "unisex", "kids_baby"];
const VALID_SELLING_STATUSES: SellingStatus[] = ["active", "paused", "discontinued"];

export interface VariantRowInput {
  optionValueIds: string[];
  sku?: string;
  quantity: number;
  variantPrice?: number;
  lowStockThresholdOverride?: number;
  sellingStatus: SellingStatus;
}

export interface ProductInput {
  name: string;
  brandId: string;
  productTypeId: string;
  audience: Audience;
  collectionId?: string;
  price: number;
  compareAtPrice?: number;
  currency: "USD" | "EGP";
  image: string;
  images?: string[];
  material?: string;
  fit?: string;
  description: string;
  details: string[];
  careInstructions: string[];
  shippingReturns: string;
  modelHeight?: string;
  modelWearing?: string;
  isNew: boolean;
  featured: boolean;
  status: ProductStatus;
  publishDate?: string;
  defaultLowStockThreshold: number;
  optionTypeIds: string[];
  valueIdsByOptionType: Record<string, string[]>;
  allowedCombinations?: string[][];
  variants: VariantRowInput[];
  colorImages: Record<string, string>;
}

// Products no longer store colors as a flat product-level field, but the
// type stays exported since ProductColorOption is still used elsewhere
// (option value display, e.g. ProductCard's color dots).
export type { ProductColorOption };

function validateVariants(variants: VariantRowInput[]): string | null {
  if (!Array.isArray(variants) || variants.length === 0) {
    return "Every product needs at least one variant — generate variants below, or leave every option unselected for a single default variant.";
  }

  const seenCombos = new Set<string>();
  for (const variant of variants) {
    if (!Number.isInteger(variant.quantity) || variant.quantity < 0) {
      return "Each variant needs a whole, non-negative quantity";
    }
    if (
      variant.lowStockThresholdOverride != null &&
      (!Number.isInteger(variant.lowStockThresholdOverride) || variant.lowStockThresholdOverride < 0)
    ) {
      return "Each variant's low stock override must be a whole, non-negative number";
    }
    if (
      variant.variantPrice != null &&
      (!Number.isFinite(variant.variantPrice) || variant.variantPrice < 0)
    ) {
      return "Variant Price cannot be negative";
    }
    if (!VALID_SELLING_STATUSES.includes(variant.sellingStatus)) {
      return "Invalid Selling Status";
    }
    const combo = [...variant.optionValueIds].sort().join(",");
    if (seenCombos.has(combo)) {
      return "Duplicate variant combination detected";
    }
    seenCombos.add(combo);
  }

  return null;
}

export function validateProductInput(body: ProductInput): string | null {
  if (!body.name?.trim()) return "Name is required";
  if (!body.brandId?.trim()) return "A brand must be selected";
  if (!body.audience || !VALID_AUDIENCES.includes(body.audience)) {
    return "Audience must be selected";
  }
  if (!body.productTypeId?.trim()) {
    return "A complete Main Category / Product Group / Product Type selection is required";
  }
  if (!Number.isFinite(body.price) || body.price <= 0) return "Price must be a positive number";
  if (
    body.compareAtPrice != null &&
    (!Number.isFinite(body.compareAtPrice) || body.compareAtPrice <= body.price)
  ) {
    return "Compare At Price must be greater than the price";
  }
  if (!body.image?.trim()) return "Main image is required";
  if (!body.description?.trim()) return "Description is required";
  if (!(["draft", "published", "archived"] as ProductStatus[]).includes(body.status)) {
    return "Invalid status";
  }
  if (!Number.isInteger(body.defaultLowStockThreshold) || body.defaultLowStockThreshold < 0) {
    return "Default Low Stock Alert must be a whole, non-negative number";
  }
  if (body.optionTypeIds.length > MAX_VARIANT_OPTIONS_PER_PRODUCT) {
    return "A product can have a maximum of 3 variant options.";
  }

  const variantError = validateVariants(body.variants);
  if (variantError) return variantError;

  const allowedResult = validateAllowedCombinations(
    body.optionTypeIds,
    body.valueIdsByOptionType,
    body.allowedCombinations ?? body.variants.map((variant) => variant.optionValueIds)
  );
  if (!allowedResult.ok) return allowedResult.error;
  const allowedKeys = new Set(allowedResult.combinations.map((combination) => combination.comboKey));
  const variantKeys = new Set(body.variants.map((variant) => [...variant.optionValueIds].sort().join(",")));
  if (allowedKeys.size !== variantKeys.size || [...allowedKeys].some((key) => !variantKeys.has(key))) {
    return "Generated variants must match the allowed combinations.";
  }

  if (body.status === "published") {
    const hasPurchasable = body.variants.some((v) => v.sellingStatus === "active" && v.quantity > 0);
    if (!hasPurchasable) {
      return "At least one variant needs stock and an Active Selling Status before publishing";
    }
  }

  return null;
}
