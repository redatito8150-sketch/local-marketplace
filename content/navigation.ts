import {
  Shirt,
  Layers,
  Sun,
  Shirt as ShirtOutline,
  Sparkles,
  Leaf,
  Flower2,
  Waves,
  Minus,
  MoreHorizontal,
  ShoppingBag,
  Wind,
} from "lucide-react";

export interface FeaturedBrandLink {
  name: string;
  slug: string;
  thumbnail: string;
}

export interface StyleCategoryLink {
  label: string;
  href: string;
  icon: React.ElementType;
}

export interface DiscoverLink {
  label: string;
  description: string;
  href: string;
}

export const FEATURED_BRANDS: FeaturedBrandLink[] = [
  {
    name: "MARGA STUDIO",
    slug: "marga-studio",
    thumbnail:
      "https://images.unsplash.com/photo-1596783074918-c84cb06531ca?w=200&q=80",
  },
  {
    name: "NOLA",
    slug: "nola",
    thumbnail:
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=200&q=80",
  },
  {
    name: "KAI",
    slug: "kai",
    thumbnail:
      "https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=200&q=80",
  },
  {
    name: "STUDIO NILE",
    slug: "studio-nile",
    thumbnail:
      "https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?w=200&q=80",
  },
  {
    name: "SAHARA FORM",
    slug: "sahara-form",
    thumbnail:
      "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=200&q=80",
  },
  {
    name: "THE CAIRO ATELIER",
    slug: "the-cairo-atelier",
    thumbnail:
      "https://images.unsplash.com/photo-1591369822096-ffd140ec948f?w=200&q=80",
  },
];

export const STYLE_CATEGORIES: StyleCategoryLink[] = [
  { label: "Streetwear", href: "/shop/women?style=streetwear", icon: Shirt },
  { label: "Classic", href: "/shop/women?style=classic", icon: ShirtOutline },
  { label: "Sahel", href: "/shop/women?style=sahel", icon: Sun },
  { label: "Casual", href: "/shop/women?style=casual", icon: Wind },
  { label: "Feminine", href: "/shop/women?style=feminine", icon: Flower2 },
  { label: "Minimal", href: "/shop/women?style=minimal", icon: Minus },
  { label: "Tailored", href: "/shop/women?style=tailored", icon: Layers },
  { label: "Resort", href: "/shop/women?style=resort", icon: ShoppingBag },
  {
    label: "Elevated Basics",
    href: "/shop/women?style=elevated-basics",
    icon: Sparkles,
  },
  { label: "Sustainable", href: "/shop/women?style=sustainable", icon: Leaf },
  { label: "Sport", href: "/shop/women?style=sport", icon: Waves },
  { label: "More Styles", href: "/shop/women", icon: MoreHorizontal },
];

export const BRANDS_PROMO = {
  heading: ["Discover.", "Support.", "Wear local."],
  subheading: "Every purchase empowers a creator.",
  ctaLabel: "Explore all brands",
  ctaHref: "/brands",
  image:
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=900&q=80",
};

export const VIEW_ALL_BRANDS_HREF = "/brands";
export const VIEW_ALL_STYLES_HREF = "/shop/women";

export const DISCOVER_LINKS: DiscoverLink[] = [
  {
    label: "New Arrivals",
    description: "Fresh drops from local brands",
    href: "/new-arrivals",
  },
  {
    label: "Best Sellers",
    description: "Our most-ordered pieces",
    href: "/best-sellers",
  },
  {
    label: "Trending",
    description: "Picking up right now",
    href: "/trending",
  },
];
