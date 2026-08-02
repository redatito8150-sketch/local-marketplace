export interface CollectionExperienceProduct {
  id: string;
  name: string;
  price: number;
  currency: "EGP" | "USD";
  image: string;
  href?: string;
  note: string;
  isDemo?: boolean;
}

export interface CollectionExperienceItem {
  id: string;
  name: string;
  eyebrow: string;
  season: string;
  description: string;
  coverImage: string;
  products: CollectionExperienceProduct[];
  isDemo?: boolean;
}

const demoProductPool = [
  { name: "Linen Oversized Shirt", note: "Sand / Relaxed fit", price: 1850, image: "/images/products/saqr-stone-overshirt/main.webp" },
  { name: "Soft Structure Blazer", note: "Mocha / Tailored", price: 2950, image: "/images/products/saqr-sand-linen-blazer/main.webp" },
  { name: "Fluid Day Trousers", note: "Clay / Wide leg", price: 1650, image: "/images/products/saqr-charcoal-trouser/main.webp" },
  { name: "Everyday Leather Loafer", note: "Espresso / Leather", price: 2400, image: "/images/products/saqr-leather-loafer/main.webp" },
  { name: "Studio Knit Polo", note: "Burgundy / Fine knit", price: 1450, image: "/images/products/saqr-navy-knit-polo/main.webp" },
  { name: "City Field Bag", note: "Oxblood / One size", price: 1250, image: "/images/products/saqr-field-bag/main.webp" },
  { name: "Cloud Layer Cardigan", note: "Oat / Soft weave", price: 1750, image: "/images/products/nabta-cloud-cardigan/main.webp" },
  { name: "Sage Chore Jacket", note: "Sage / Easy fit", price: 2100, image: "/images/products/nabta-sage-chore-jacket/main.webp" },
] as const;

export const demoCollectionDefinitions = [
  { name: "SAHEL ’26", season: "Summer 2026", description: "Breezy linen, sun-faded tones, and easy silhouettes made for long days by the sea.", coverImage: "/images/join/brand-story/fashion-designer.png" },
  { name: "DOWNTOWN AFTER DARK", season: "Fall 2025", description: "Deep burgundy, sharp layers, and confident pieces shaped by the energy of Alexandria after sunset.", coverImage: "/images/join/brand-story/brand-photoshoot.png" },
  { name: "DESERT BLOOM", season: "Pre-fall 2025", description: "Warm earth tones and fluid textures inspired by the quiet movement of the Western Desert.", coverImage: "/images/join/brand-story/accessories-founder.png" },
  { name: "SOFT STRUCTURE", season: "Winter 2026", description: "Clean lines, considered tailoring, and relaxed foundations for a new kind of everyday uniform.", coverImage: "/images/join/brand-story/founder-collaboration.png" },
] as const;

export function makeDemoCollectionProducts(collectionIndex: number): CollectionExperienceProduct[] {
  return Array.from({ length: 4 }, (_, productIndex) => {
    const source = demoProductPool[(collectionIndex * 2 + productIndex) % demoProductPool.length];
    return { id: `collection-demo-${collectionIndex}-${productIndex}`, name: source.name, note: source.note, price: source.price, currency: "EGP", image: source.image, isDemo: true };
  });
}

export function buildDemoCollectionItems(startIndex = 0): CollectionExperienceItem[] {
  return demoCollectionDefinitions.slice(startIndex).map((collection, index) => {
    const absoluteIndex = startIndex + index;
    return { id: `demo-${absoluteIndex}`, name: collection.name, eyebrow: "8 pieces", season: collection.season, description: collection.description, coverImage: collection.coverImage, products: makeDemoCollectionProducts(absoluteIndex), isDemo: true };
  });
}
