import { CATEGORIES } from "@/content/categories";
import type { CategorySlug, ProductColorOption, ProductDetail } from "@/types";
import { parseCsv, parseLines } from "./parseTextInputs";

// Keep this in sync with next.config.js `images.remotePatterns` — a URL
// whose host isn't here would crash next/image (this project has hit that
// exact crash before with an unwhitelisted host), so the preview never
// hands ProductGallery anything outside this list.
const ALLOWED_IMAGE_HOSTS = ["images.unsplash.com", "i.imgur.com"];

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
  price: string;
  currency: "USD" | "EGP";
  image: string;
  imagesText: string;
  sizesText: string;
  colors: ProductColorOption[];
  description: string;
  detailsText: string;
  careInstructionsText: string;
  shippingReturns: string;
  sku: string;
  inStock: boolean;
  unavailableSizes: string[];
}

// Same fallback rule as app/api/admin/products/route.ts's insert: gallery
// images win if provided, otherwise fall back to the single main image —
// this keeps the preview honest about what will actually be saved. Shared
// so ProductLivePreview can memoize just the image list on its own,
// without recomputing (or duplicating) this whenever unrelated fields change.
export function deriveProductImages(image: string, imagesText: string): string[] {
  const galleryLines = parseLines(imagesText);
  const images = galleryLines.length ? galleryLines : image.trim() ? [image.trim()] : [];
  return images.filter(isPreviewImageSafe);
}

export function buildPreviewProduct(
  form: ProductPreviewFormValues,
  id?: string
): ProductDetail {
  const safeImages = deriveProductImages(form.image, form.imagesText);

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
    currency: form.currency,
    images: safeImages,
    description: form.description.trim(),
    details: parseLines(form.detailsText),
    careInstructions: parseLines(form.careInstructionsText),
    shippingReturns: form.shippingReturns.trim(),
    sizes: parseCsv(form.sizesText),
    unavailableSizes: form.unavailableSizes,
    colors: form.colors.filter((c) => c.name.trim() && c.hex.trim()),
    rating: 5,
    reviewCount: 0,
    reviews: [],
    sku: form.sku.trim() || "SKU-PREVIEW",
    inStock: form.inStock,
    categorySlug: category,
    categoryLabel,
    categoryHref,
    relatedIds: [],
  };
}
