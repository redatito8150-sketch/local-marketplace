import { BrandPageContent, BrandProduct, BrandValue, SimilarBrand } from "@/types";

const GENERIC_VALUES: BrandValue[] = [
  {
    icon: "flag",
    title: "Made in Egypt",
    description: "Every piece is produced locally by Egyptian makers.",
  },
  {
    icon: "package",
    title: "Small Batch Production",
    description: "Limited runs keep quality high and waste close to zero.",
  },
  {
    icon: "leaf",
    title: "Natural Materials",
    description: "Responsibly sourced fabrics and materials, always.",
  },
  {
    icon: "pen",
    title: "Designed in Egypt",
    description: "Every piece begins as a sketch inspired by the country itself.",
  },
];

function genericProducts(prefix: string, image: string): BrandProduct[] {
  const names = [
    "Signature Piece",
    "Everyday Essential",
    "Studio Favorite",
    "Limited Edition",
  ];
  return names.map((name, i) => ({
    id: `${prefix}-${i + 1}`,
    name,
    price: 750 + i * 350,
    currency: "EGP",
    colors: ["#111111", "#EDE6D9"],
    image,
    isNew: i === 0,
  }));
}

function similarBrandsExcluding(slug: string): SimilarBrand[] {
  const all: SimilarBrand[] = [
    {
      id: "marga-studio",
      name: "MARGA STUDIO",
      category: "Premium Linen Fashion",
      city: "Cairo",
      image:
        "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600&q=80",
    },
    {
      id: "nola",
      name: "NOLA",
      category: "Contemporary Womenswear",
      city: "Cairo",
      image:
        "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&q=80",
    },
    {
      id: "kai",
      name: "KAI",
      category: "Minimal Accessories",
      city: "Alexandria",
      image:
        "https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=600&q=80",
    },
    {
      id: "studio-nile",
      name: "STUDIO NILE",
      category: "Menswear",
      city: "Giza",
      image:
        "https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?w=600&q=80",
    },
    {
      id: "sahara-form",
      name: "SAHARA FORM",
      category: "Home & Ceramics",
      city: "Cairo",
      image:
        "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=600&q=80",
    },
  ];
  return all.filter((b) => b.id !== slug).slice(0, 4);
}

function buildBrand(input: {
  slug: string;
  name: string;
  tagline: string;
  category: string;
  foundedYear: number;
  heroImage: string;
  aboutImage: string;
  storyImage: string;
}): Record<string, BrandPageContent> {
  return {
    [input.slug]: {
      slug: input.slug,
      name: input.name,
      tagline: input.tagline,
      category: input.category,
      foundedYear: input.foundedYear,
      city: "Cairo",
      heroImage: input.heroImage,
      aboutDescription: `${input.name} creates ${input.category.toLowerCase()} rooted in Egyptian craftsmanship, designed for everyday life and made in limited quantities.`,
      aboutImage: input.aboutImage,
      infoBadges: [
        { icon: "location", label: "Cairo" },
        { icon: "flag", label: "Made in Egypt" },
        { icon: "truck", label: "Ships in 2–4 Days" },
        { icon: "leaf", label: "Sustainable Fabrics" },
      ],
      categoryTabs: [
        { id: "shop-all", label: "Shop All" },
        { id: "new-arrivals", label: "New Arrivals" },
        { id: "essentials", label: "Essentials" },
        { id: "our-story", label: "Our Story" },
      ],
      activeTab: "shop-all",
      products: genericProducts(input.slug, input.aboutImage),
      storyImage: input.storyImage,
      storyBody: `Founded in Cairo, ${input.name} celebrates Egyptian craftsmanship through considered design. The brand works with local makers and carefully selected materials to produce modern essentials in limited quantities.`,
      values: GENERIC_VALUES,
      similarBrands: similarBrandsExcluding(input.slug),
    },
  };
}

export const BRANDS: Record<string, BrandPageContent> = {
  "marga-studio": {
    slug: "marga-studio",
    name: "MARGA STUDIO",
    tagline: "Timeless linen clothing designed and made in Cairo.",
    category: "Premium Linen Fashion",
    foundedYear: 2022,
    city: "Cairo",
    heroImage:
      "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=2000&q=80",
    aboutDescription:
      "MARGA Studio creates timeless linen clothing inspired by Cairo's architecture, light, and everyday rhythm. Every piece is designed and produced in Egypt using premium natural fabrics in limited quantities.",
    aboutImage:
      "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&q=80",
    infoBadges: [
      { icon: "location", label: "Cairo" },
      { icon: "flag", label: "Made in Egypt" },
      { icon: "truck", label: "Ships in 2–4 Days" },
      { icon: "leaf", label: "Sustainable Fabrics" },
    ],
    categoryTabs: [
      { id: "shop-all", label: "Shop All" },
      { id: "new-arrivals", label: "New Arrivals" },
      { id: "linen-essentials", label: "Linen Essentials" },
      { id: "summer-2026", label: "Summer 2026" },
      { id: "our-story", label: "Our Story" },
    ],
    activeTab: "shop-all",
    products: [
      {
        id: "p1",
        name: "Linen Oversized Shirt",
        price: 1450,
        currency: "EGP",
        colors: ["#EDE6D9", "#111111", "#8C8172"],
        image:
          "https://images.unsplash.com/photo-1596783074918-c84cb06531ca?w=700&q=80",
        isNew: true,
      },
      {
        id: "p2",
        name: "Wide Leg Linen Pants",
        price: 1700,
        currency: "EGP",
        colors: ["#111111", "#8C8172"],
        image:
          "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=700&q=80",
      },
      {
        id: "p3",
        name: "Minimal Linen Dress",
        price: 2100,
        currency: "EGP",
        colors: ["#EDE6D9", "#111111"],
        image:
          "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=700&q=80",
        isNew: true,
      },
      {
        id: "p4",
        name: "Relaxed Linen Blazer",
        price: 2450,
        currency: "EGP",
        colors: ["#8C8172", "#111111", "#EDE6D9"],
        image:
          "https://images.unsplash.com/photo-1591369822096-ffd140ec948f?w=700&q=80",
      },
      {
        id: "p5",
        name: "Linen Wrap Skirt",
        price: 1350,
        currency: "EGP",
        colors: ["#EDE6D9", "#8C8172"],
        image:
          "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=700&q=80",
      },
      {
        id: "p6",
        name: "Sleeveless Linen Top",
        price: 980,
        currency: "EGP",
        colors: ["#111111", "#EDE6D9"],
        image:
          "https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=700&q=80",
        isNew: true,
      },
      {
        id: "p7",
        name: "Linen Co-ord Set",
        price: 2850,
        currency: "EGP",
        colors: ["#EDE6D9", "#8C8172", "#111111"],
        image:
          "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?w=700&q=80",
      },
      {
        id: "p8",
        name: "Everyday Linen Shirt",
        price: 1250,
        currency: "EGP",
        colors: ["#111111", "#EDE6D9"],
        image:
          "https://images.unsplash.com/photo-1548624313-0396c75f6a70?w=700&q=80",
      },
    ],
    storyImage:
      "https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=1000&q=80",
    storyBody:
      "Founded in Cairo, MARGA Studio celebrates Egyptian craftsmanship through timeless design. The brand collaborates with local artisans and carefully selected natural fabrics to produce modern wardrobe essentials in limited quantities.",
    values: [
      {
        icon: "flag",
        title: "Made in Egypt",
        description: "Every piece is cut, sewn, and finished by hand in Cairo workshops.",
      },
      {
        icon: "package",
        title: "Small Batch Production",
        description: "Limited runs keep quality high and waste close to zero.",
      },
      {
        icon: "leaf",
        title: "Natural Fabrics",
        description: "Only breathable, biodegradable linen sourced responsibly.",
      },
      {
        icon: "pen",
        title: "Designed in Cairo",
        description: "Every silhouette begins as a sketch inspired by the city itself.",
      },
    ],
    similarBrands: [
      {
        id: "nola",
        name: "NOLA",
        category: "Contemporary Womenswear",
        city: "Cairo",
        image:
          "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&q=80",
      },
      {
        id: "kai",
        name: "KAI",
        category: "Minimal Accessories",
        city: "Alexandria",
        image:
          "https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=600&q=80",
      },
      {
        id: "sahara-form",
        name: "SAHARA FORM",
        category: "Home & Ceramics",
        city: "Cairo",
        image:
          "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=600&q=80",
      },
      {
        id: "studio-nile",
        name: "STUDIO NILE",
        category: "Menswear",
        city: "Giza",
        image:
          "https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?w=600&q=80",
      },
    ],
  },

  ...buildBrand({
    slug: "nola",
    name: "NOLA",
    tagline: "Contemporary womenswear rooted in Cairo's modern rhythm.",
    category: "Contemporary Womenswear",
    foundedYear: 2021,
    heroImage:
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=2000&q=80",
    aboutImage:
      "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&q=80",
    storyImage:
      "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1000&q=80",
  }),

  ...buildBrand({
    slug: "kai",
    name: "KAI",
    tagline: "Minimal accessories crafted for everyday wear.",
    category: "Minimal Accessories",
    foundedYear: 2023,
    heroImage:
      "https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=2000&q=80",
    aboutImage:
      "https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=800&q=80",
    storyImage:
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=1000&q=80",
  }),

  ...buildBrand({
    slug: "studio-nile",
    name: "STUDIO NILE",
    tagline: "Modern menswear built on considered tailoring.",
    category: "Menswear",
    foundedYear: 2020,
    heroImage:
      "https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?w=2000&q=80",
    aboutImage:
      "https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=800&q=80",
    storyImage:
      "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=1000&q=80",
  }),

  ...buildBrand({
    slug: "sahara-form",
    name: "SAHARA FORM",
    tagline: "Ceramics and home objects shaped by the desert.",
    category: "Home & Ceramics",
    foundedYear: 2019,
    heroImage:
      "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=2000&q=80",
    aboutImage:
      "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=800&q=80",
    storyImage:
      "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1000&q=80",
  }),

  ...buildBrand({
    slug: "the-cairo-atelier",
    name: "THE CAIRO ATELIER",
    tagline: "Bespoke tailoring for the modern Cairene wardrobe.",
    category: "Made-to-Measure",
    foundedYear: 2018,
    heroImage:
      "https://images.unsplash.com/photo-1591369822096-ffd140ec948f?w=2000&q=80",
    aboutImage:
      "https://images.unsplash.com/photo-1591369822096-ffd140ec948f?w=800&q=80",
    storyImage:
      "https://images.unsplash.com/photo-1544923246-77307dd654cb?w=1000&q=80",
  }),
};

export function getBrandContent(slug: string): BrandPageContent | null {
  return BRANDS[slug] ?? null;
}
