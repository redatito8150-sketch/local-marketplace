import { Product, CategorySlug } from "@/types";

export const PRODUCTS: Product[] = [
  // Women
  {
    id: "w-1",
    category: "women",
    brand: "AUREUM",
    name: "Linen Blend Oversized Shirt",
    price: 129.0,
    rating: 5,
    reviewCount: 24,
    image:
      "https://images.unsplash.com/photo-1596783074918-c84cb06531ca?w=600&q=80",
  },
  {
    id: "w-2",
    category: "women",
    brand: "NOYA",
    name: "Ribbed Knit Maxi Dress",
    price: 189.0,
    rating: 5,
    reviewCount: 18,
    image:
      "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=600&q=80",
  },
  {
    id: "w-3",
    category: "women",
    brand: "ÉLAN ATELIER",
    name: "Tailored Linen Blazer",
    price: 249.0,
    rating: 5,
    reviewCount: 31,
    image:
      "https://images.unsplash.com/photo-1591369822096-ffd140ec948f?w=600&q=80",
  },
  {
    id: "w-4",
    category: "women",
    brand: "KIVARI",
    name: "Asymmetric One Shoulder Top",
    price: 99.0,
    rating: 5,
    reviewCount: 12,
    image:
      "https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=600&q=80",
  },
  {
    id: "w-5",
    category: "women",
    brand: "AUREUM",
    name: "Wide Leg Tailored Trousers",
    price: 159.0,
    rating: 4,
    reviewCount: 9,
    image:
      "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&q=80",
  },
  {
    id: "w-6",
    category: "women",
    brand: "NOYA",
    name: "Silk Slip Midi Dress",
    price: 219.0,
    rating: 5,
    reviewCount: 27,
    image:
      "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?w=600&q=80",
  },
  {
    id: "w-7",
    category: "women",
    brand: "OTHER BRANDS",
    name: "Cropped Wool Cardigan",
    price: 139.0,
    rating: 4,
    reviewCount: 15,
    image:
      "https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=600&q=80",
  },
  {
    id: "w-8",
    category: "women",
    brand: "KIVARI",
    name: "Belted Trench Coat",
    price: 289.0,
    rating: 5,
    reviewCount: 22,
    image:
      "https://images.unsplash.com/photo-1548624313-0396c75f6a70?w=600&q=80",
  },

  // Men
  {
    id: "m-1",
    category: "men",
    brand: "AUREUM",
    name: "Merino Wool Crewneck Sweater",
    price: 149.0,
    rating: 5,
    reviewCount: 19,
    image:
      "https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=600&q=80",
  },
  {
    id: "m-2",
    category: "men",
    brand: "NOYA",
    name: "Tailored Cotton Chinos",
    price: 119.0,
    rating: 4,
    reviewCount: 14,
    image:
      "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=600&q=80",
  },
  {
    id: "m-3",
    category: "men",
    brand: "ÉLAN ATELIER",
    name: "Structured Wool Overcoat",
    price: 329.0,
    rating: 5,
    reviewCount: 26,
    image:
      "https://images.unsplash.com/photo-1544923246-77307dd654cb?w=600&q=80",
  },
  {
    id: "m-4",
    category: "men",
    brand: "KIVARI",
    name: "Relaxed Fit Linen Shirt",
    price: 89.0,
    rating: 4,
    reviewCount: 11,
    image:
      "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&q=80",
  },

  // Kids
  {
    id: "k-1",
    category: "kids",
    brand: "AUREUM",
    name: "Organic Cotton Playsuit",
    price: 49.0,
    rating: 5,
    reviewCount: 8,
    image:
      "https://images.unsplash.com/photo-1519457851160-6d5b0c944241?w=600&q=80",
  },
  {
    id: "k-2",
    category: "kids",
    brand: "NOYA",
    name: "Knit Cardigan Set",
    price: 59.0,
    rating: 5,
    reviewCount: 13,
    image:
      "https://images.unsplash.com/photo-1503457574465-52ee3dbedcd6?w=600&q=80",
  },
  {
    id: "k-3",
    category: "kids",
    brand: "ÉLAN ATELIER",
    name: "Corduroy Overalls",
    price: 69.0,
    rating: 4,
    reviewCount: 6,
    image:
      "https://images.unsplash.com/photo-1471286174890-9c112ffca5b4?w=600&q=80",
  },
  {
    id: "k-4",
    category: "kids",
    brand: "KIVARI",
    name: "Cotton Jersey Dress",
    price: 45.0,
    rating: 4,
    reviewCount: 5,
    image:
      "https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=600&q=80",
  },
];

export function getProductsByCategory(category: CategorySlug): Product[] {
  return PRODUCTS.filter((p) => p.category === category);
}

export function getProductCountLabel(category: CategorySlug): number {
  // In a real app this would be the total count from the backend/catalog,
  // independent of how many demo items are seeded above.
  const base = getProductsByCategory(category).length;
  return category === "women" ? 342 : base * 40;
}
