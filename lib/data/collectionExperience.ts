export interface CollectionExperienceProduct {
  id: string;
  name: string;
  price: number;
  currency: "EGP" | "USD";
  image: string;
  href?: string;
  note: string;
}

export interface CollectionExperienceItem {
  id: string;
  name: string;
  eyebrow: string;
  season: string;
  description: string;
  // One or more — shown as an auto-advancing slideshow when there's more
  // than one (see components/brand/CollectionCoverCarousel).
  coverImages: string[];
  products: CollectionExperienceProduct[];
}
