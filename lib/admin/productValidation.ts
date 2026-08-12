import type { Audience, ProductColorOption, ProductStatus, SellingStatus } from "@/types";
import { MAX_VARIANT_OPTIONS_PER_PRODUCT } from "../inventory/variantCombinations.ts";

export const DESCRIPTION_MAX_LENGTH = 800;
const VALID_AUDIENCES: Audience[] = ["men", "women", "unisex", "kids_baby"];
const VALID_SELLING_STATUSES: SellingStatus[] = ["active", "paused", "discontinued"];

export interface VariantRowInput {
  id?: string;
  optionValueIds: string[];
  sku?: string;
  quantity: number;
  openingStock?: number;
  variantPrice?: number;
  // Mutually exclusive with the product-level discountPercent below — see
  // the check in validateProductSections().
  variantDiscountPercent?: number;
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
  discountPercent?: number;
  discountEndsAt?: string;
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
  // Both computed/admin-owned, never sent by the editor (see
  // lib/admin/productPersistence.ts's conditional-write handling).
  isNew?: boolean;
  featured?: boolean;
  status: ProductStatus;
  publishDate?: string;
  defaultLowStockThreshold: number;
  optionTypeIds: string[];
  valueIdsByOptionType: Record<string, string[]>;
  allowedCombinations?: string[][];
  variants: VariantRowInput[];
  colorImages: Record<string, string>;
  colorOptionTypeId?: string;
  // Zakhnook Partner brand — never trust the client for this, same rule
  // as brandId above; callers must set it from the authenticated owner's
  // own brands.is_mahaly_partner, not whatever the request body claims.
  // A partner brand's variants always start at 0 live quantity by design
  // (lib/admin/variantPersistence.ts's forceZeroOpeningStock — their
  // stock is provisioned later via a confirmed Local Warehouse transfer,
  // never through this form), so the "needs purchasable stock to publish"
  // rule below must not apply to them the same way it does to a
  // brand_direct brand — otherwise a partner brand could never publish
  // anything at all.
  isPartnerBrand?: boolean;
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
  // Every current issue is a required-field gap (there are no soft/nice-
  // to-have warnings yet) — this stays here so the "N issue(s)" badge's
  // count can be defined as "required issues only" without silently
  // including a future optional/informational issue if one is ever added.
  optional?: boolean;
}

function validateVariants(variants: VariantRowInput[], requireAtLeastOne: boolean): string | null {
  if (!Array.isArray(variants)) return "Invalid variants";
  if (requireAtLeastOne && variants.length === 0) {
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
    if (
      variant.variantDiscountPercent != null &&
      (!Number.isFinite(variant.variantDiscountPercent) || variant.variantDiscountPercent <= 0 || variant.variantDiscountPercent >= 100)
    ) {
      return "Variant Discount % must be between 1 and 99";
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
  if (!(["draft", "published", "archived"] as ProductStatus[]).includes(body.status)) {
    add("visibility", "Invalid status", "product-status");
  }

  // A Draft exists specifically so a brand owner can save whatever they
  // have and come back later — only "what kind of product is this"
  // (name/brand/audience/category, checked unconditionally above) is
  // required to save one at all. Everything below (price, cover image,
  // description, having any variants) is only enforced once the product
  // is actually going public — Published or Archived both need the full
  // picture; Archived just skips the "has purchasable stock" rule further
  // down, since an archived product isn't for sale right now by definition.
  const requiresCompleteInfo = body.status !== "draft";

  if (requiresCompleteInfo && (!Number.isFinite(body.price) || body.price <= 0)) {
    add("pricing", "Price must be a positive number", "product-price");
  }
  if (
    body.discountPercent != null &&
    (!Number.isFinite(body.discountPercent) || body.discountPercent <= 0 || body.discountPercent >= 100)
  ) {
    add("pricing", "Discount % must be between 1 and 99", "product-discount-percent");
  }
  if (body.discountEndsAt != null && Number.isNaN(new Date(body.discountEndsAt).getTime())) {
    add("pricing", "Discount end date is invalid", "product-discount-ends-at");
  }
  if (requiresCompleteInfo && !body.image?.trim()) add("media", "Main image is required", "product-media");
  if (requiresCompleteInfo && !body.description?.trim()) {
    add("details", "Description is required", "product-description");
  } else if (body.description && body.description.length > DESCRIPTION_MAX_LENGTH) {
    add("details", `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer`, "product-description");
  }
  if (!Number.isInteger(body.defaultLowStockThreshold) || body.defaultLowStockThreshold < 0) {
    add("inventory", "Default Low Stock Alert must be a whole, non-negative number", "inventory-variants");
  }
  if (body.optionTypeIds.length > MAX_VARIANT_OPTIONS_PER_PRODUCT) {
    add("inventory", "A product can have a maximum of 3 variant options.", "inventory-variants");
  }

  const variantError = validateVariants(body.variants, requiresCompleteInfo);
  if (variantError) add("inventory", variantError, "inventory-variants");

  // Server-side backstop for the mutual-exclusion the editor UI already
  // enforces by disabling one field while the other is set — a product
  // discount and a per-variant discount can never both be active, or a
  // variant's effective price would silently stack two separate discounts.
  const hasProductDiscount = body.discountPercent != null && body.discountPercent > 0;
  const hasVariantDiscount = body.variants.some((v) => v.variantDiscountPercent != null && v.variantDiscountPercent > 0);
  if (hasProductDiscount && hasVariantDiscount) {
    add("pricing", "A product can't have both a product-wide Discount % and a per-variant Variant Discount % at the same time.", "product-discount-percent");
  }

  // Single-color products fall back to the Main Image (see "media" check
  // above) — a dedicated Color image only becomes mandatory once the
  // product has 2+ Colors, and only once it's actually going public
  // (Published or Archived — Draft always saves regardless).
  const colorValueIds = body.colorOptionTypeId ? body.valueIdsByOptionType[body.colorOptionTypeId] ?? [] : [];
  if (requiresCompleteInfo && colorValueIds.length >= 2) {
    const missingLabelIds = colorValueIds.filter((id) => !body.colorImages[id]?.trim());
    if (missingLabelIds.length > 0) {
      add("media", "This product has multiple colors — add a primary image for each color before publishing.", "product-media");
    }
  }

  // Archived is intentionally "not for sale right now" — it still needs
  // the full product info above, just not live purchasable stock, unlike
  // Published which does.
  //
  // A partner brand is the one deliberate exception: their variants
  // always start at 0 live quantity (see isPartnerBrand's comment above),
  // so requiring quantity > 0 here would make publishing permanently
  // impossible for them — 0 stock right after creation is their normal,
  // expected state, not a sign the form was left incomplete. They still
  // need at least one Active variant (not everything paused/discontinued)
  // — the actual sellable-stock gap is expected to close once Mahaly's
  // warehouse confirms a transfer, same as any other out-of-stock product.
  if (body.status === "published") {
    const hasPurchasable = body.isPartnerBrand
      ? body.variants.some((v) => v.sellingStatus === "active")
      : body.variants.some((v) => v.sellingStatus === "active" && v.quantity > 0);
    if (!hasPurchasable) {
      add(
        "inventory",
        body.isPartnerBrand
          ? "At least one variant needs an Active Selling Status before publishing"
          : "At least one variant needs stock and an Active Selling Status before publishing",
        "generated-variants"
      );
    }
  }

  // Materials are optional, but once any are added their percentages must
  // total exactly 100 once the product is going public (Draft may stay
  // incomplete).
  const materials = body.materials ?? [];
  if (materials.length > 0) {
    const total = materials.reduce((sum, m) => sum + (Number.isFinite(m.percentage) ? m.percentage : 0), 0);
    const totalIsValid = Math.abs(total - 100) < 0.01;
    if (requiresCompleteInfo && !totalIsValid) {
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
