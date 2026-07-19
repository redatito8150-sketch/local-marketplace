import { CATEGORIES } from "@/content/categories";
import { deriveLegacyFieldsFromVariants } from "@/lib/admin/deriveFromVariants";
import type { VariantInput } from "@/lib/admin/productValidation";
import type { CategorySlug, ProductColorOption, ProductDetail } from "@/types";
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

// Structurally matches (a subset of) ProductForm's FormState — passing the
// real form state in satisfies this without either file importing the
// other's type.
export interface ProductPreviewFormValues {
  name: string;
  brandName: string;
  brandSlug: string;
  category: "" | "women" | "men" | "kids";
  productCategory: string;
  productType: string;
  collection: string;
  price: string;
  compareAtPrice: string;
  image: string;
  images: string[];
  colors: ProductColorOption[];
  material: string;
  fit: string;
  variants: VariantInput[];
  description: string;
  detailsText: string;
  careInstructionsText: string;
  shippingReturns: string;
  modelHeight: string;
  modelWearing: string;
  sku: string;
  trackInventory: boolean;
  featured: boolean;
}

// Images now come from real Supabase Storage uploads (already-safe URLs),
// not admin-typed text — the gallery wins if any images were uploaded,
// otherwise falls back to the single main image, mirroring the API
// route's own `images.length ? images : [image]` fallback.
export function deriveProductImages(image: string, images: string[]): string[] {
  const gallery = images.filter(Boolean);
  const list = gallery.length ? gallery : image.trim() ? [image.trim()] : [];
  return list.filter(isPreviewImageSafe);
}

export function buildPreviewProduct(
  form: ProductPreviewFormValues,
  id?: string
): ProductDetail {
  const safeImages = deriveProductImages(form.image, form.images);
  // Same derivation the API route uses to keep the legacy sizes/colors/
  // unavailableSizes/inStock fields coherent with the variant grid — the
  // preview shows exactly what will actually be saved.
  const legacy = deriveLegacyFieldsFromVariants(form.variants, form.colors, form.trackInventory);

  const category = (form.category || undefined) as CategorySlug | undefined;
  const categoryLabel = category
    ? CATEGORIES[category].label
    : form.brandName.trim() || "Brand";
  const categoryHref = category ? `/shop/${category}` : "#";

  return {
    id: id ?? "preview",
    name: form.name.trim() || "Untitled product",
    brandName: form.brandName.trim() || "Brand name",
    brandSlug: form.brandSlug || undefined,
    price: Number(form.price) || 0,
    compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : undefined,
    currency: "EGP",
    images: safeImages,
    description: form.description.trim(),
    details: parseLines(form.detailsText),
    careInstructions: parseLines(form.careInstructionsText),
    shippingReturns: form.shippingReturns.trim(),
    sizes: legacy.sizes,
    unavailableSizes: legacy.unavailableSizes,
    colors: legacy.colors,
    rating: 5,
    reviewCount: 0,
    reviews: [],
    sku: form.sku.trim() || "SKU-PREVIEW",
    inStock: legacy.inStock,
    categorySlug: category,
    categoryLabel,
    categoryHref,
    relatedIds: [],
    productCategory: form.productCategory || undefined,
    productType: form.productType || undefined,
    collection: form.collection || undefined,
    material: form.material || undefined,
    fit: form.fit || undefined,
    modelHeight: form.modelHeight || undefined,
    modelWearing: form.modelWearing || undefined,
    featured: form.featured,
    variants: form.variants.map((v, i) => ({
      id: v.id ?? `preview-${i}`,
      productId: id ?? "preview",
      color: v.color,
      size: v.size,
      sku: v.sku,
      quantity: v.quantity,
      lowStockThreshold: v.lowStockThreshold,
      priceOverride: v.priceOverride,
      availabilityStatus: v.availabilityStatus,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
  };
}
