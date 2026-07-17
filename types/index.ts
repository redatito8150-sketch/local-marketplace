export type CategorySlug = "women" | "men" | "kids";

export interface CategoryHeroContent {
  slug: CategorySlug;
  title: string;
  description: string;
  ctaLabel: string;
  heroImage: string;
}

export interface CollectionCardContent {
  id: string;
  title: string;
  ctaLabel: string;
  image: string;
  href: string;
}

export interface FeaturedBrandContent {
  heading: string;
  description: string;
  ctaLabel: string;
  image: string;
}

export interface CategoryContent {
  slug: CategorySlug;
  label: string;
  hero: CategoryHeroContent;
  collectionCards: CollectionCardContent[];
  featuredBrand: FeaturedBrandContent;
}

export interface FilterOption {
  id: string;
  label: string;
  count?: number;
}

export interface FilterGroup {
  id: string;
  title: string;
  options: FilterOption[];
}

export interface Product {
  id: string;
  category: CategorySlug;
  brand: string;
  name: string;
  price: number;
  rating: number;
  reviewCount: number;
  image: string;
}

export type SortOption = "newest" | "price-asc" | "price-desc" | "top-rated";

export type ViewMode = "grid" | "list";

// ── Brand page types (LOCAL brand-page template) ────────────────────────────

export interface BrandInfoBadge {
  icon: "location" | "flag" | "truck" | "leaf";
  label: string;
}

export interface BrandProduct {
  id: string;
  name: string;
  price: number;
  currency: "EGP";
  colors: string[];
  image: string;
  isNew?: boolean;
}

export interface BrandValue {
  icon: "flag" | "package" | "leaf" | "pen";
  title: string;
  description: string;
}

export interface SimilarBrand {
  id: string;
  name: string;
  category: string;
  city: string;
  image: string;
}

export interface BrandCategoryTab {
  id: string;
  label: string;
}

export interface ProductReview {
  id: string;
  author: string;
  rating: number;
  date: string;
  comment: string;
}

export interface ProductColorOption {
  name: string;
  hex: string;
}

export interface ProductDetail {
  id: string;
  name: string;
  brandName: string;
  brandSlug?: string;
  price: number;
  currency: "USD" | "EGP";
  images: string[];
  description: string;
  details: string[];
  careInstructions: string[];
  shippingReturns: string;
  sizes: string[];
  colors: ProductColorOption[];
  rating: number;
  reviewCount: number;
  reviews: ProductReview[];
  sku: string;
  inStock: boolean;
  categorySlug?: CategorySlug;
  categoryLabel: string;
  categoryHref: string;
  relatedIds: string[];
}

export interface BrandPageContent {
  slug: string;
  name: string;
  tagline: string;
  category: string;
  foundedYear: number;
  city: string;
  heroImage: string;
  aboutDescription: string;
  aboutImage: string;
  infoBadges: BrandInfoBadge[];
  categoryTabs: BrandCategoryTab[];
  activeTab: string;
  products: BrandProduct[];
  storyImage: string;
  storyBody: string;
  values: BrandValue[];
  similarBrands: SimilarBrand[];
}

