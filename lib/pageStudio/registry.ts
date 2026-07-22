export const PAGE_SECTION_TYPES = [
  "hero",
  "category_cards",
  "benefits_strip",
  "product_carousel",
  "product_grid",
  "mood_tiles",
  "featured_brand",
  "brand_carousel",
  "promotional_banner",
  "editorial_image",
  "text_block",
  "newsletter",
  "sponsored_brands",
  "custom_product_collection",
  "all_products_preview",
] as const;

export type PageSectionType = (typeof PAGE_SECTION_TYPES)[number];

export const ADDABLE_PAGE_SECTION_TYPES: PageSectionType[] = [
  "product_carousel",
  "product_grid",
  "featured_brand",
  "brand_carousel",
  "promotional_banner",
  "editorial_image",
  "text_block",
  "newsletter",
  "sponsored_brands",
  "custom_product_collection",
];

export interface PageSectionRecord {
  id: string;
  pageKey: string;
  sectionKey: string;
  sectionType: PageSectionType;
  position: number;
  isRequired: boolean;
  config: Record<string, unknown>;
  visible: boolean;
  updatedAt: string;
  publishedAt?: string;
}

type RegistryEntry = {
  label: string;
  canDuplicate: boolean;
  defaultConfig: Record<string, unknown>;
};

export const PAGE_SECTION_REGISTRY: Record<PageSectionType, RegistryEntry> = {
  hero: { label: "Hero", canDuplicate: false, defaultConfig: { headingLines: [], subheading: "", ctaLabel: "", ctaHref: "/brands" } },
  category_cards: { label: "Category cards", canDuplicate: false, defaultConfig: { items: [] } },
  benefits_strip: { label: "Benefits strip", canDuplicate: false, defaultConfig: { items: [] } },
  product_carousel: { label: "Product carousel", canDuplicate: true, defaultConfig: { title: "Products", source: "new", itemCount: 10, displayStyle: "carousel" } },
  product_grid: { label: "Product grid", canDuplicate: true, defaultConfig: { title: "Products", source: "all", itemCount: 12, displayStyle: "grid" } },
  mood_tiles: { label: "Shop by mood", canDuplicate: false, defaultConfig: { items: [] } },
  featured_brand: { label: "Featured brand", canDuplicate: true, defaultConfig: { featuredBrandSlug: "", sponsoredBrandSlugs: [] } },
  brand_carousel: { label: "Brand carousel", canDuplicate: true, defaultConfig: { title: "Featured brands", brandSlugs: [] } },
  promotional_banner: { label: "Promotional banner", canDuplicate: true, defaultConfig: { title: "", description: "", ctaLabel: "", ctaHref: "", image: "", imageAlt: "" } },
  editorial_image: { label: "Editorial image", canDuplicate: true, defaultConfig: { image: "", imageAlt: "", caption: "" } },
  text_block: { label: "Text block", canDuplicate: true, defaultConfig: { title: "", body: "" } },
  newsletter: { label: "Newsletter", canDuplicate: false, defaultConfig: { title: "Join our community", description: "" } },
  sponsored_brands: { label: "Sponsored brands", canDuplicate: true, defaultConfig: { title: "Sponsored brands", brandSlugs: [] } },
  custom_product_collection: { label: "Custom product collection", canDuplicate: true, defaultConfig: { title: "Collection", productIds: [], itemCount: 12, displayStyle: "carousel" } },
  all_products_preview: { label: "All products preview", canDuplicate: false, defaultConfig: { title: "Explore All Products", itemCount: 12, sorting: "newest", featuredOnly: false, displayStyle: "carousel" } },
};

const FORBIDDEN_KEYS = new Set([
  "html",
  "rawHtml",
  "script",
  "code",
  "component",
  "dangerouslySetInnerHTML",
]);
const PRODUCT_SOURCES = new Set(["new", "trending", "bestsellers", "all", "featured"]);
const DISPLAY_STYLES = new Set(["carousel", "grid"]);
const SORTING = new Set(["newest", "price-asc", "price-desc", "top-rated"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validText(value: unknown, max = 240): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function validOptionalText(value: unknown, max = 500): boolean {
  return value == null || value === "" || (typeof value === "string" && value.length <= max);
}

function validHref(value: unknown): boolean {
  if (!validText(value, 500)) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function validImage(value: unknown): boolean {
  return validHref(value);
}

function validItemCount(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 20;
}

function validateSafeTree(value: unknown, depth = 0): string | null {
  if (depth > 8) return "Configuration nesting is too deep";
  if (Array.isArray(value)) {
    if (value.length > 40) return "Configuration contains too many items";
    for (const item of value) {
      const error = validateSafeTree(item, depth + 1);
      if (error) return error;
    }
    return null;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) return `Unsupported configuration field: ${key}`;
      const error = validateSafeTree(child, depth + 1);
      if (error) return error;
    }
    return null;
  }
  if (value == null || ["string", "number", "boolean"].includes(typeof value)) return null;
  return "Configuration contains an unsupported value";
}

function itemsFrom(config: unknown): unknown[] | null {
  if (Array.isArray(config)) return config;
  if (isPlainObject(config) && Array.isArray(config.items)) return config.items;
  if (isPlainObject(config)) {
    const values = Object.values(config);
    if (values.length > 0 && values.every(isPlainObject)) return values;
  }
  return null;
}

function validateLinkedImageItems(config: unknown, maxItems: number): string | null {
  const items = itemsFrom(config);
  if (!items || items.length < 1 || items.length > maxItems) return `Provide between 1 and ${maxItems} items`;
  for (const item of items) {
    if (!isPlainObject(item) || !validText(item.label ?? item.title, 100)) return "Every item needs a title";
    if (!validImage(item.image) || !validOptionalText(item.imageAlt, 160)) return "Every item needs a valid image and alt text";
    if (item.href != null && item.href !== "" && !validHref(item.href)) return "Every item link must be an internal path or HTTPS URL";
  }
  return null;
}

function validateProductSection(config: Record<string, unknown>): string | null {
  if (!validText(config.title, 120)) return "Section title is required";
  if (config.source != null && !PRODUCT_SOURCES.has(String(config.source))) return "Invalid product source";
  const count = config.itemCount ?? config.limit;
  if (!validItemCount(count)) return "Item count must be between 1 and 20";
  if (config.displayStyle != null && !DISPLAY_STYLES.has(String(config.displayStyle))) return "Invalid display style";
  if (config.sorting != null && !SORTING.has(String(config.sorting))) return "Invalid product sorting";
  return null;
}

export function validatePageSectionConfig(type: PageSectionType, config: unknown): string | null {
  if (!PAGE_SECTION_TYPES.includes(type)) return "Unsupported section type";
  let serialized: string;
  try {
    serialized = JSON.stringify(config);
  } catch {
    return "Configuration must be valid JSON";
  }
  if (serialized.length > 64_000) return "Configuration is too large";
  const treeError = validateSafeTree(config);
  if (treeError) return treeError;

  if (type === "mood_tiles" || type === "category_cards") {
    // Legacy category-card records are normalized by the data layer before save.
    return validateLinkedImageItems(config, type === "category_cards" ? 8 : 10);
  }
  if (!isPlainObject(config)) return "Configuration must be an object";

  if (type === "hero") {
    if (!Array.isArray(config.headingLines) || config.headingLines.length < 1 || config.headingLines.length > 4 || config.headingLines.some((line) => !validText(line, 100))) return "Hero needs 1 to 4 heading lines";
    if (!validText(config.subheading, 300) || !validText(config.ctaLabel, 80)) return "Hero subheading and button label are required";
    if (config.ctaHref != null && !validHref(config.ctaHref)) return "Hero button link is invalid";
    if (config.image != null && !validImage(config.image)) return "Hero image is invalid";
    return null;
  }
  if (type === "product_carousel" || type === "product_grid" || type === "all_products_preview") return validateProductSection(config);
  if (type === "custom_product_collection") {
    const baseError = validateProductSection(config);
    if (baseError) return baseError;
    if (!Array.isArray(config.productIds) || config.productIds.length < 1 || config.productIds.length > 30 || config.productIds.some((id) => !validText(id, 160))) return "Choose between 1 and 30 products";
    return null;
  }
  if (type === "featured_brand") {
    if (!validText(config.featuredBrandSlug, 160)) return "Featured brand is required";
    if (!Array.isArray(config.sponsoredBrandSlugs) || config.sponsoredBrandSlugs.length > 12 || config.sponsoredBrandSlugs.some((slug) => !validText(slug, 160))) return "Sponsored brand list is invalid";
    return null;
  }
  if (type === "brand_carousel" || type === "sponsored_brands") {
    if (!validText(config.title, 120) || !Array.isArray(config.brandSlugs) || config.brandSlugs.length < 1 || config.brandSlugs.length > 12) return "Choose a title and between 1 and 12 brands";
    return null;
  }
  if (type === "promotional_banner") {
    if (!validText(config.title, 120) || !validOptionalText(config.description, 500) || !validImage(config.image) || !validText(config.imageAlt, 160)) return "Banner title, image, and alt text are required";
    if (config.ctaHref != null && config.ctaHref !== "" && !validHref(config.ctaHref)) return "Banner link is invalid";
    return null;
  }
  if (type === "editorial_image") {
    return validImage(config.image) && validText(config.imageAlt, 160) ? null : "Image and alt text are required";
  }
  if (type === "text_block") {
    return validText(config.title, 120) && validText(config.body, 2_000) ? null : "Text block title and body are required";
  }
  if (type === "newsletter") {
    return validText(config.title, 120) && validOptionalText(config.description, 500) ? null : "Newsletter title is required";
  }
  if (type === "benefits_strip") {
    const items = itemsFrom(config);
    if (!items || items.length < 1 || items.length > 8) return "Benefits strip needs between 1 and 8 items";
    if (items.some((item) => !isPlainObject(item) || !validText(item.title, 100) || !validText(item.detail, 180))) {
      return "Every benefit needs a title and detail";
    }
    return null;
  }
  return null;
}
