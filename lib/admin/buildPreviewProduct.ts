import { resolveTaxonomyPath } from "@/lib/data/taxonomy";
import { primaryShopCategoryForAudience } from "@/lib/audience";
import { calculateStockStatus, effectiveLowStockThreshold } from "@/lib/inventory/stockStatus";
import { effectiveVariantPrice } from "@/lib/inventory/pricing";
import type { Audience, ProductDetail, TaxonomyNode } from "@/types";
import type { InventoryVariantsValue, OptionValueOption } from "@/components/admin/InventoryVariantsSection";
import { parseLines } from "./parseTextInputs";

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
  detailsText: string;
  careInstructionsText: string;
  shippingReturns: string;
  modelHeight: string;
  modelWearing: string;
  sku: string;
  featured: boolean;
}

export function deriveProductImages(image: string, images: string[]): string[] {
  const gallery = images.filter(Boolean);
  const list = gallery.length ? gallery : image.trim() ? [image.trim()] : [];
  return list.filter(isPreviewImageSafe);
}

export function buildPreviewProduct(
  form: ProductPreviewFormValues,
  taxonomyNodes: TaxonomyNode[],
  optionValues: OptionValueOption[],
  id?: string
): ProductDetail {
  const safeImages = deriveProductImages(form.image, form.images);
  const audience = (form.audience || "unisex") as Audience;
  const categorySlug = primaryShopCategoryForAudience(audience);
  const path = resolveTaxonomyPath(taxonomyNodes, form.productTypeId);

  const productPrice = Number(form.price) || 0;
  const { variants, defaultLowStockThreshold } = form.inventoryVariants;
  const labelFor = (id: string) => optionValues.find((v) => v.id === id)?.label ?? "";
  const sizes = [...new Set(variants.flatMap((v) => v.optionValueIds.map(labelFor)).filter(Boolean))];
  const inStock = variants.some((v) => {
    const threshold = effectiveLowStockThreshold(v.lowStockThresholdOverride, defaultLowStockThreshold);
    return v.sellingStatus === "active" && calculateStockStatus(v.quantity, threshold) !== "out_of_stock";
  });
  const previewPrice = variants.length > 0 ? effectiveVariantPrice(variants[0].variantPrice, productPrice) : productPrice;

  return {
    id: id ?? "preview",
    name: form.name.trim() || "Untitled product",
    brandName: form.brandName.trim() || "Brand name",
    brandSlug: undefined,
    price: previewPrice,
    compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : undefined,
    currency: "EGP",
    images: safeImages,
    description: form.description.trim(),
    details: parseLines(form.detailsText),
    careInstructions: parseLines(form.careInstructionsText),
    shippingReturns: form.shippingReturns.trim(),
    sizes,
    unavailableSizes: [],
    colors: [],
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
    variants: [],
  };
}
