import { resolveTaxonomyPath } from "@/lib/data/taxonomy";
import { primaryShopCategoryForAudience } from "@/lib/audience";
import { calculateStockStatus, effectiveLowStockThreshold } from "@/lib/inventory/stockStatus";
import type { Audience, ProductDetail, ProductMaterialEntry, TaxonomyNode } from "@/types";
import type { InventoryVariantsValue, OptionTypeOption, OptionValueOption } from "@/components/admin/InventoryVariantsSection";

// Keep this in sync with next.config.js `images.remotePatterns` — a URL
// whose host isn't here would crash next/image (this project has hit that
// exact crash before with an unwhitelisted host), so the preview never
// hands ProductGallery anything outside this list.
const ALLOWED_IMAGE_HOSTS = [
  "images.unsplash.com",
  "i.imgur.com",
  "kdrrzrboibwyxzrfwsgu.supabase.co",
];

export function isPreviewImageSafe(url: string): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_IMAGE_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

export interface ProductPreviewFormValues {
  name: string;
  brandName: string;
  audience: Audience | "";
  productTypeId: string;
  collectionName: string;
  price: string;
  compareAtPrice: string;
  image: string;
  images: string[];
  inventoryVariants: InventoryVariantsValue;
  description: string;
  details: string[];
  careInstructions: string[];
  materials: ProductMaterialEntry[];
  fit: string;
  // Already resolved (Brand policy or marketplace default) by the caller —
  // see lib/admin/shippingPolicy.ts. This is display text only.
  shippingReturns: string;
  modelHeight: string;
  modelWearing: string;
  sku: string;
  featured: boolean;
}

export function deriveProductImages(image: string, images: string[], colorImages: Record<string, string> = {}): string[] {
  return [...new Set([image.trim(), ...images, ...Object.values(colorImages)].filter(Boolean))].filter(isPreviewImageSafe);
}

export function buildPreviewProduct(
  form: ProductPreviewFormValues,
  taxonomyNodes: TaxonomyNode[],
  optionValues: OptionValueOption[],
  id?: string,
  optionTypes: OptionTypeOption[] = []
): ProductDetail {
  const safeImages = deriveProductImages(form.image, form.images, form.inventoryVariants.colorImages);
  const audience = (form.audience || "unisex") as Audience;
  const categorySlug = primaryShopCategoryForAudience(audience);
  const path = resolveTaxonomyPath(taxonomyNodes, form.productTypeId);

  const productPrice = Number(form.price) || 0;
  const { variants, defaultLowStockThreshold } = form.inventoryVariants;
  const valueFor = (id: string) => optionValues.find((v) => v.id === id);
  const typeFor = (id: string) => optionTypes.find((type) => type.id === id);
  const sizeType = optionTypes.find((type) => type.key === "size");
  const colorType = optionTypes.find((type) => type.key === "color");
  const sizes = [...new Set(variants.flatMap((v) => v.optionValueIds.filter((id) => valueFor(id)?.optionTypeId === sizeType?.id).map((id) => valueFor(id)?.label ?? "")).filter(Boolean))];
  const colors = (form.inventoryVariants.valueIdsByOptionType[colorType?.id ?? ""] ?? []).map((id) => {
    const option = valueFor(id);
    return { name: option?.label ?? "", hex: option?.primaryColor ?? "#888888", swatchType: option?.swatchType, secondaryColor: option?.secondaryColor };
  }).filter((color) => color.name);
  const inStock = variants.some((v) => {
    const threshold = effectiveLowStockThreshold(v.lowStockThresholdOverride, defaultLowStockThreshold);
    return v.sellingStatus === "active" && calculateStockStatus(v.quantity, threshold) !== "out_of_stock";
  });
  return {
    id: id ?? "preview",
    name: form.name.trim() || "Untitled product",
    brandName: form.brandName.trim() || "Brand name",
    brandSlug: undefined,
    // The base Pricing-step price, unconditionally — never a specific
    // variant's override. ProductInfo (reused as-is by this Preview)
    // already resolves the *selected* Color/Size's own Variant Price (or
    // falls back to this base) on its own; overriding it here with
    // variants[0]'s price previously made every color/size *without* its
    // own override silently inherit whichever variant happened to be
    // first in the array, regardless of what was actually selected.
    price: productPrice,
    compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : undefined,
    currency: "EGP",
    images: safeImages,
    description: form.description.trim(),
    details: form.details.map((d) => d.trim()).filter(Boolean),
    careInstructions: form.careInstructions,
    materials: form.materials,
    fit: form.fit || undefined,
    shippingReturns: form.shippingReturns.trim(),
    sizes,
    unavailableSizes: [],
    colors,
    rating: 5,
    reviewCount: 0,
    reviews: [],
    sku: form.sku.trim() || "SKU-PREVIEW",
    inStock,
    categorySlug,
    categoryHref: `/shop/${categorySlug}`,
    relatedIds: [],
    productTypeId: form.productTypeId,
    mainCategory: path?.mainCategory ?? "",
    productGroup: path?.productGroup ?? "",
    productTypeName: path?.productTypeName ?? "",
    audience,
    collectionId: undefined,
    collectionName: form.collectionName || undefined,
    modelHeight: form.modelHeight || undefined,
    modelWearing: form.modelWearing || undefined,
    featured: form.featured,
    variants: variants.map((variant, index) => ({
      id: `preview-${index}`,
      productId: id ?? "preview",
      sku: variant.sku ?? `PREVIEW-${index + 1}`,
      quantity: variant.quantity,
      lowStockThresholdOverride: variant.lowStockThresholdOverride,
      variantPrice: variant.variantPrice,
      sellingStatus: variant.sellingStatus,
      isArchived: false,
      optionValues: variant.optionValueIds.map((valueId) => {
        const option = valueFor(valueId);
        const type = typeFor(option?.optionTypeId ?? "");
        return {
          optionTypeId: option?.optionTypeId ?? "",
          optionTypeName: type?.name ?? "Option",
          optionValueId: valueId,
          label: option?.label ?? "",
          swatchType: option?.swatchType,
          primaryColor: option?.primaryColor,
          secondaryColor: option?.secondaryColor,
        };
      }),
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    })),
    colorImages: Object.fromEntries(
      Object.entries(form.inventoryVariants.colorImages).map(([valueId, url]) => [valueFor(valueId)?.label ?? valueId, url])
    ),
  };
}
