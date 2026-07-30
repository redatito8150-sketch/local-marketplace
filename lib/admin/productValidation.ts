import type { Audience, ProductColorOption, ProductStatus, SellingStatus } from "@/types";
import { MAX_VARIANT_OPTIONS_PER_PRODUCT } from "../inventory/variantCombinations.ts";

const VALID_AUDIENCES: Audience[] = ["men", "women", "unisex", "kids_baby"];
const VALID_SELLING_STATUSES: SellingStatus[] = ["active", "paused", "discontinued"];

export interface VariantRowInput {
  id?: string;
  optionValueIds: string[];
  sku?: string;
  quantity: number;
  openingStock?: number;
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
  // Legacy single-material field — no longer sent by the editor (kept
  // optional so an omitted value never overwrites existing legacy data).
  material?: string;
  materials?: { material: string; percentage: number }[];
  fit?: string;
  description: string;
  details: string[];
  careInstructions: string[];
  // Legacy — Shipping & Returns is resolved from the Brand's policy at
  // read time (lib/admin/shippingPolicy.ts), never edited/sent per product.
  shippingReturns?: string;
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
  colorOptionTypeId?: string;
}

// Products no longer store colors as a flat product-level field, but the
// type stays exported since ProductColorOption is still used elsewhere
// (option value display, e.g. ProductCard's color dots).
export type { ProductColorOption };

export type ProductEditorSectionId = "basic" | "pricing" | "media" | "inventory" | "details" | "visibility";

export interface ProductValidationIssue {
  section: ProductEditorSectionId;
  message: string;
  fieldId: string;
}

function validateVariants(variants: VariantRowInput[]): string | null {
  if (!Array.isArray(variants) || variants.length === 0) {
    return "Every product needs at least one variant — generate variants below, or leave every option unselected for a single default variant.";
  }

  const seenCombos = new Set<string>();
  for (const variant of variants) {
    if (!Number.isInteger(variant.quantity) || variant.quantity < 0) {
      return "Each variant needs a whole, non-negative quantity";
    }
    if (!variant.id && (!Number.isInteger(variant.openingStock ?? variant.quantity) || (variant.openingStock ?? variant.quantity) < 0)) {
      return "Opening Stock must be a whole, non-negative number";
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

export function validateProductSections(body: ProductInput): ProductValidationIssue[] {
  const issues: ProductValidationIssue[] = [];
  const add = (section: ProductEditorSectionId, message: string, fieldId: string) =>
    issues.push({ section, message, fieldId });

  if (!body.name?.trim()) add("basic", "Name is required", "product-name");
  if (!body.brandId?.trim()) add("basic", "A brand must be selected", "product-brand");
  if (!body.audience || !VALID_AUDIENCES.includes(body.audience)) {
    add("basic", "Audience must be selected", "product-audience");
  }
  if (!body.productTypeId?.trim()) {
    add("basic", "A complete Main Category / Product Group / Product Type selection is required", "product-taxonomy");
  }
  if (!Number.isFinite(body.price) || body.price <= 0) add("pricing", "Price must be a positive number", "product-price");
  if (
    body.compareAtPrice != null &&
    (!Number.isFinite(body.compareAtPrice) || body.compareAtPrice <= body.price)
  ) {
    add("pricing", "Compare At Price must be greater than the price", "product-compare-price");
  }
  if (!body.image?.trim()) add("media", "Main image is required", "product-media");
  if (!body.description?.trim()) add("details", "Description is required", "product-description");
  if (!(["draft", "published", "archived"] as ProductStatus[]).includes(body.status)) {
    add("visibility", "Invalid status", "product-status");
  }
  if (!Number.isInteger(body.defaultLowStockThreshold) || body.defaultLowStockThreshold < 0) {
    add("inventory", "Default Low Stock Alert must be a whole, non-negative number", "inventory-variants");
  }
  if (body.optionTypeIds.length > MAX_VARIANT_OPTIONS_PER_PRODUCT) {
    add("inventory", "A product can have a maximum of 3 variant options.", "inventory-variants");
  }

  const variantError = validateVariants(body.variants);
  if (variantError) add("inventory", variantError, "inventory-variants");

  // Single-color products fall back to the Main Image (see "media" check
  // above) — a dedicated Color image only becomes mandatory once the
  // product has 2+ Colors, and only for publishing (Draft always saves).
  const colorValueIds = body.colorOptionTypeId ? body.valueIdsByOptionType[body.colorOptionTypeId] ?? [] : [];
  if (body.status === "published" && colorValueIds.length >= 2) {
    const missingLabelIds = colorValueIds.filter((id) => !body.colorImages[id]?.trim());
    if (missingLabelIds.length > 0) {
      add("media", "This product has multiple colors — add a primary image for each color before publishing.", "product-media");
    }
  }

  if (body.status === "published") {
    const hasPurchasable = body.variants.some((v) => v.sellingStatus === "active" && v.quantity > 0);
    if (!hasPurchasable) {
      add("inventory", "At least one variant needs stock and an Active Selling Status before publishing", "generated-variants");
    }
  }

  // Materials are optional, but once any are added their percentages must
  // total exactly 100 before publishing (Draft may stay incomplete).
  const materials = body.materials ?? [];
  if (materials.length > 0) {
    const total = materials.reduce((sum, m) => sum + (Number.isFinite(m.percentage) ? m.percentage : 0), 0);
    const totalIsValid = Math.abs(total - 100) < 0.01;
    if (body.status === "published" && !totalIsValid) {
      add("details", `Material percentages must total exactly 100% (currently ${Math.round(total * 100) / 100}%).`, "product-materials");
    }
    if (materials.some((m) => !m.material?.trim())) {
      add("details", "Every material row needs a material selected.", "product-materials");
    }
    if (materials.some((m) => !Number.isFinite(m.percentage) || m.percentage < 0 || m.percentage > 100)) {
      add("details", "Each material's percentage must be between 0 and 100.", "product-materials");
    }
  }

  return issues;
}

export function validateProductInput(body: ProductInput): string | null {
  return validateProductSections(body)[0]?.message ?? null;
}
