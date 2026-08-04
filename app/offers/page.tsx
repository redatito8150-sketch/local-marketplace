import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import DealsExperience from "@/components/offers/DealsExperience";
import { getMarketplaceCatalogPage } from "@/lib/data/products";
import type { Product } from "@/types";

export const metadata: Metadata = {
  title: "Deals — Mahaly",
  description: "Limited-time prices from Mahaly's independent local brands.",
};

export const revalidate = 60;

function previewDeal(
  id: string,
  name: string,
  brand: string,
  price: number,
  discountPercent: number,
  image: string,
  audience: Product["audience"],
  productTypeName: string,
  endsInHours: number,
  now: number,
): Product {
  return {
    id,
    name,
    brand,
    brandSlug: brand.toLowerCase().replace(/\s+/g, "-"),
    price,
    discountPercent,
    discountEndsAt: new Date(now + endsInHours * 3_600_000).toISOString(),
    currency: "EGP",
    image,
    audience,
    category: audience === "kids_baby" ? "kids" : audience === "women" ? "women" : "men",
    productTypeId: id,
    mainCategory: productTypeName === "Bag" ? "Accessories" : "Fashion",
    productGroup: productTypeName,
    productTypeName,
    rating: 4.8,
    reviewCount: 24,
    sizes: [],
    colors: [],
    inStock: true,
    variants: [],
    isNew: false,
  };
}

function createPreviewDeals(now: number): Product[] {
  return [
    previewDeal("stone-overshirt", "Stone Linen Overshirt", "SAQR CAIRO", 1850, 26, "/images/products/saqr-stone-overshirt/main.webp", "men", "Shirt", 8, now),
    previewDeal("charcoal-trouser", "Tailored Linen Pant", "SAQR CAIRO", 1650, 22, "/images/products/saqr-charcoal-trouser/main.webp", "men", "Trousers", 34, now),
    previewDeal("field-bag", "Leather Crossbody Bag", "SAQR CAIRO", 2950, 30, "/images/products/saqr-field-bag/main.webp", "unisex", "Bag", 30, now),
    previewDeal("leather-loafer", "Cairo Leather Loafer", "SAQR CAIRO", 2450, 24, "/images/products/saqr-leather-loafer/main.webp", "men", "Shoes", 42, now),
    previewDeal("sand-blazer", "Sand Linen Blazer", "SAQR CAIRO", 2750, 28, "/images/products/saqr-sand-linen-blazer/main.webp", "men", "Blazer", 16, now),
    previewDeal("navy-polo", "Navy Knit Polo", "SAQR CAIRO", 1320, 25, "/images/products/saqr-navy-knit-polo/main.webp", "men", "Shirt", 12, now),
    previewDeal("cloud-cardigan", "Cloud Knit Cardigan", "NABTA", 1420, 30, "/images/products/nabta-cloud-cardigan/main.webp", "women", "Cardigan", 22, now),
    previewDeal("coral-daypack", "Coral Daypack", "NABTA", 600, 25, "/images/products/nabta-coral-daypack/main.webp", "kids_baby", "Bag", 48, now),
    previewDeal("sunstep-sneaker", "Sunstep Sneaker", "NABTA", 625, 28, "/images/products/nabta-sunstep-sneaker/main.webp", "kids_baby", "Shoes", 40, now),
  ];
}

export default async function OffersPage() {
  const result = await getMarketplaceCatalogPage({
    pageSize: 24,
    sort: "newest",
    filters: { discounted: ["discounted-only"] },
  });
  // Server-only preview clock: the generated dates are serialized into the client payload,
  // so hydration receives the exact same values and the countdown stays deterministic.
  // eslint-disable-next-line react-hooks/purity
  const products = result.products.length ? result.products : createPreviewDeals(Date.now());

  return (
    <main className="min-h-screen bg-[#f7f3ee]">
      <Header />
      <DealsExperience products={products} />
      <Footer />
    </main>
  );
}
