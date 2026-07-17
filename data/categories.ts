import { CategoryContent, FilterGroup, CategorySlug } from "@/types";

export const CATEGORIES: Record<CategorySlug, CategoryContent> = {
  women: {
    slug: "women",
    label: "Women",
    hero: {
      slug: "women",
      title: "Women's Collection",
      description:
        "Discover premium local fashion brands curated for every occasion.",
      ctaLabel: "Explore Collection",
      heroImage:
        "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1600&q=80",
    },
    collectionCards: [
      {
        id: "new-arrivals",
        title: "New Arrivals",
        ctaLabel: "Explore Now",
        image:
          "https://images.unsplash.com/photo-1618244972963-dbee1a7edc95?w=400&q=80",
        href: "/shop/women?collection=new-arrivals",
      },
      {
        id: "best-sellers",
        title: "Best Sellers",
        ctaLabel: "Explore Now",
        image:
          "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&q=80",
        href: "/shop/women?collection=best-sellers",
      },
      {
        id: "trending",
        title: "Trending",
        ctaLabel: "Explore Now",
        image:
          "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&q=80",
        href: "/shop/women?collection=trending",
      },
    ],
    featuredBrand: {
      heading: "Featured Local Brand",
      description:
        "Celebrating local craftsmanship, timeless design, and the new wave of fashion innovators.",
      ctaLabel: "Discover The Brand",
      image:
        "https://images.unsplash.com/photo-1490725263030-1f0521cec8ec?w=1600&q=80",
    },
  },
  men: {
    slug: "men",
    label: "Men",
    hero: {
      slug: "men",
      title: "Men's Collection",
      description:
        "Discover premium local fashion brands curated for every occasion.",
      ctaLabel: "Explore Collection",
      heroImage:
        "https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?w=1600&q=80",
    },
    collectionCards: [
      {
        id: "new-arrivals",
        title: "New Arrivals",
        ctaLabel: "Explore Now",
        image:
          "https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=400&q=80",
        href: "/shop/men?collection=new-arrivals",
      },
      {
        id: "best-sellers",
        title: "Best Sellers",
        ctaLabel: "Explore Now",
        image:
          "https://images.unsplash.com/photo-1520975916090-3105956dac38?w=400&q=80",
        href: "/shop/men?collection=best-sellers",
      },
      {
        id: "trending",
        title: "Trending",
        ctaLabel: "Explore Now",
        image:
          "https://images.unsplash.com/photo-1488161628813-04466f872be2?w=400&q=80",
        href: "/shop/men?collection=trending",
      },
    ],
    featuredBrand: {
      heading: "Featured Local Brand",
      description:
        "Celebrating local craftsmanship, timeless design, and the new wave of fashion innovators.",
      ctaLabel: "Discover The Brand",
      image:
        "https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=1600&q=80",
    },
  },
  kids: {
    slug: "kids",
    label: "Kids",
    hero: {
      slug: "kids",
      title: "Kids' Collection",
      description:
        "Discover premium local fashion brands curated for every occasion.",
      ctaLabel: "Explore Collection",
      heroImage:
        "https://images.unsplash.com/photo-1503919545889-aef636e10ad4?w=1600&q=80",
    },
    collectionCards: [
      {
        id: "new-arrivals",
        title: "New Arrivals",
        ctaLabel: "Explore Now",
        image:
          "https://images.unsplash.com/photo-1519457851160-6d5b0c944241?w=400&q=80",
        href: "/shop/kids?collection=new-arrivals",
      },
      {
        id: "best-sellers",
        title: "Best Sellers",
        ctaLabel: "Explore Now",
        image:
          "https://images.unsplash.com/photo-1503457574465-52ee3dbedcd6?w=400&q=80",
        href: "/shop/kids?collection=best-sellers",
      },
      {
        id: "trending",
        title: "Trending",
        ctaLabel: "Explore Now",
        image:
          "https://images.unsplash.com/photo-1471286174890-9c112ffca5b4?w=400&q=80",
        href: "/shop/kids?collection=trending",
      },
    ],
    featuredBrand: {
      heading: "Featured Local Brand",
      description:
        "Celebrating local craftsmanship, timeless design, and the new wave of fashion innovators.",
      ctaLabel: "Discover The Brand",
      image:
        "https://images.unsplash.com/photo-1503919545889-aef636e10ad4?w=1600&q=80",
    },
  },
};

export function getCategoryContent(slug: string): CategoryContent | null {
  if (slug === "women" || slug === "men" || slug === "kids") {
    return CATEGORIES[slug];
  }
  return null;
}

export const FILTER_GROUPS: FilterGroup[] = [
  {
    id: "brand",
    title: "Brand",
    options: [
      { id: "noya", label: "Noya", count: 32 },
      { id: "elan-atelier", label: "Élan Atelier", count: 28 },
      { id: "aureum", label: "Aureum", count: 21 },
      { id: "kivari", label: "Kivari", count: 18 },
      { id: "other-brands", label: "Other Brands", count: 42 },
    ],
  },
  {
    id: "price",
    title: "Price",
    options: [
      { id: "under-50", label: "Under $50" },
      { id: "50-100", label: "$50 - $100" },
      { id: "100-200", label: "$100 - $200" },
      { id: "200-500", label: "$200 - $500" },
      { id: "above-500", label: "Above $500" },
    ],
  },
  {
    id: "size",
    title: "Size",
    options: [
      { id: "xs", label: "XS" },
      { id: "s", label: "S" },
      { id: "m", label: "M" },
      { id: "l", label: "L" },
      { id: "xl", label: "XL" },
    ],
  },
  {
    id: "color",
    title: "Color",
    options: [
      { id: "black", label: "Black" },
      { id: "white", label: "White" },
      { id: "beige", label: "Beige" },
      { id: "brown", label: "Brown" },
      { id: "green", label: "Green" },
    ],
  },
  {
    id: "availability",
    title: "Availability",
    options: [
      { id: "in-stock", label: "In Stock" },
      { id: "out-of-stock", label: "Out of Stock" },
    ],
  },
  {
    id: "rating",
    title: "Rating",
    options: [
      { id: "4-plus", label: "4 Stars & Up" },
      { id: "3-plus", label: "3 Stars & Up" },
    ],
  },
];
