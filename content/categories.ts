import { CategoryContent, CategorySlug } from "@/types";

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
      heading: "SAQR CAIRO",
      description:
        "Measured tailoring, relaxed utility, and considered menswear made in Cairo.",
      ctaLabel: "Discover SAQR",
      image: "/images/brands/saqr-cairo/campaign.webp",
      href: "/brands/saqr-cairo",
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
      heading: "NABTA KIDS",
      description:
        "Soft natural fabrics, happy color, and practical shapes for growing adventures.",
      ctaLabel: "Discover NABTA",
      image: "/images/brands/nabta-kids/campaign.webp",
      href: "/brands/nabta-kids",
    },
  },
};

export function getCategoryContent(slug: string): CategoryContent | null {
  if (slug === "women" || slug === "men" || slug === "kids") {
    return CATEGORIES[slug];
  }
  return null;
}
