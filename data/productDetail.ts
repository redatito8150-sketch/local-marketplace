import { ProductDetail, ProductReview, Product, BrandProduct } from "@/types";
import { PRODUCTS, getProductsByCategory } from "@/data/products";
import { BRANDS } from "@/data/brand";
import { CATEGORIES } from "@/data/categories";

const DEFAULT_SIZES = ["XS", "S", "M", "L", "XL"];

const REVIEW_AUTHORS = ["Mona K.", "Youssef A.", "Salma R.", "Karim T.", "Nadine H."];

function generateReviews(count: number, rating: number): ProductReview[] {
  const comments = [
    "Beautiful quality, fits exactly as expected. Would buy again.",
    "Fabric feels premium and the fit is true to size.",
    "Really happy with this — great attention to detail.",
    "Good product overall, delivery was quick too.",
    "Exceeded my expectations, the craftsmanship really shows.",
  ];
  return Array.from({ length: Math.min(count, 5) }).map((_, i) => ({
    id: `r-${i + 1}`,
    author: REVIEW_AUTHORS[i % REVIEW_AUTHORS.length],
    rating: Math.max(3, rating - (i % 2)),
    date: `2026-0${(i % 6) + 1}-1${i}`,
    comment: comments[i % comments.length],
  }));
}

function colorsFromHexList(hexes: string[]) {
  const names: Record<string, string> = {
    "#111111": "Black",
    "#EDE6D9": "Beige",
    "#8C8172": "Taupe",
  };
  return hexes.map((hex) => ({ name: names[hex] ?? "Natural", hex }));
}

function fromCategoryProduct(product: Product): ProductDetail {
  const category = CATEGORIES[product.category];
  const siblings = getProductsByCategory(product.category).filter(
    (p) => p.id !== product.id
  );

  return {
    id: product.id,
    name: product.name,
    brandName: product.brand,
    price: product.price,
    currency: "USD",
    images: [
      product.image,
      "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=900&q=80",
      "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=900&q=80",
    ],
    description: `${product.name} from ${product.brand} — a considered, everyday piece cut from premium materials and designed to move with you. Part of the ${category.label} collection at Local.`,
    details: [
      `Brand: ${product.brand}`,
      "Premium natural-blend fabric",
      "Designed in limited quantities",
      "Model is 5'9\" wearing size S",
    ],
    careInstructions: [
      "Machine wash cold with like colors",
      "Do not bleach",
      "Tumble dry low",
      "Warm iron if needed",
    ],
    shippingReturns:
      "Free standard delivery on orders over $25. Easy 30-day returns — unworn items with tags attached.",
    sizes: DEFAULT_SIZES,
    colors: colorsFromHexList(["#111111", "#EDE6D9", "#8C8172"]),
    rating: product.rating,
    reviewCount: product.reviewCount,
    reviews: generateReviews(product.reviewCount, product.rating),
    sku: `LC-${product.id.toUpperCase()}`,
    inStock: true,
    categorySlug: product.category,
    categoryLabel: category.label,
    categoryHref: `/shop/${product.category}`,
    relatedIds: siblings.slice(0, 4).map((p) => p.id),
  };
}

function fromBrandProduct(product: BrandProduct, brandSlug: string): ProductDetail {
  const brand = BRANDS[brandSlug];
  const siblings = brand.products.filter((p) => p.id !== product.id);

  return {
    id: product.id,
    name: product.name,
    brandName: brand.name,
    brandSlug: brand.slug,
    price: product.price,
    currency: "EGP",
    images: [
      product.image,
      brand.aboutImage,
      "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=900&q=80",
    ],
    description: `${product.name} by ${brand.name} — ${brand.aboutDescription}`,
    details: [
      `Brand: ${brand.name}`,
      `Made in ${brand.city}, Egypt`,
      "Natural, breathable fabric",
      "Produced in small batches",
    ],
    careInstructions: [
      "Hand wash cold or gentle machine cycle",
      "Do not bleach",
      "Line dry in shade",
      "Warm iron on reverse if needed",
    ],
    shippingReturns:
      "Ships in 2–4 days across Egypt. Easy 14-day returns on unworn items with tags attached.",
    sizes: DEFAULT_SIZES,
    colors: colorsFromHexList(product.colors),
    rating: 5,
    reviewCount: 8 + (product.id.length % 20),
    reviews: generateReviews(6, 5),
    sku: `${brand.slug.toUpperCase()}-${product.id.toUpperCase()}`,
    inStock: true,
    categoryLabel: brand.name,
    categoryHref: `/brands/${brand.slug}`,
    relatedIds: siblings.slice(0, 4).map((p) => p.id),
  };
}

export function getProductDetail(id: string): ProductDetail | null {
  const categoryProduct = PRODUCTS.find((p) => p.id === id);
  if (categoryProduct) return fromCategoryProduct(categoryProduct);

  for (const brand of Object.values(BRANDS)) {
    const match = brand.products.find((p) => p.id === id);
    if (match) return fromBrandProduct(match, brand.slug);
  }

  return null;
}

export function getRelatedProductCards(
  ids: string[]
): { id: string; name: string; brand: string; price: number; currency: "USD" | "EGP"; image: string; rating: number; reviewCount: number }[] {
  return ids
    .map((id) => {
      const categoryProduct = PRODUCTS.find((p) => p.id === id);
      if (categoryProduct) {
        return {
          id: categoryProduct.id,
          name: categoryProduct.name,
          brand: categoryProduct.brand,
          price: categoryProduct.price,
          currency: "USD" as const,
          image: categoryProduct.image,
          rating: categoryProduct.rating,
          reviewCount: categoryProduct.reviewCount,
        };
      }
      for (const brand of Object.values(BRANDS)) {
        const match = brand.products.find((p) => p.id === id);
        if (match) {
          return {
            id: match.id,
            name: match.name,
            brand: brand.name,
            price: match.price,
            currency: "EGP" as const,
            image: match.image,
            rating: 5,
            reviewCount: 12,
          };
        }
      }
      return null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
}
