import type { CategorySlug } from "@/types";

export type HeroPlacement = {
  className: string;
  rotation: number;
  zIndex: number;
};

export type CollectionTheme = {
  section: string;
  backdrop: string;
  floor: string;
  card: string;
  accent: string;
  shadow: string;
};

export type CollectionPageConfig = {
  slug: CategorySlug;
  title: string;
  description: string;
  modelImage: string;
  modelAlt: string;
  featuredProductIds: readonly string[];
  allowProductFallback?: boolean;
  placements: HeroPlacement[];
  modelDesktopClass: string;
  completeLookClass: string;
  theme: CollectionTheme;
};

const WOMEN_PLACEMENTS: HeroPlacement[] = [
  { className: "left-[31%] top-[13%]", rotation: -4, zIndex: 3 },
  { className: "left-[37%] top-[48%]", rotation: 3.5, zIndex: 4 },
  { className: "right-[24%] top-[7%]", rotation: -2.5, zIndex: 2 },
  { className: "right-[12%] top-[18%]", rotation: 3, zIndex: 3 },
  { className: "right-[3%] top-[45%]", rotation: -4, zIndex: 2 },
];

export const COLLECTION_PAGE_CONFIGS: Record<CategorySlug, CollectionPageConfig> = {
  women: {
    slug: "women",
    title: "Women’s Collection",
    description: "Timeless pieces. Modern silhouettes.\nCurated for every moment.",
    modelImage: "/images/women-hero-model.png",
    modelAlt: "Woman wearing the featured collection",
    featuredProductIds: [
      "blazer-5f53",
      "sleevless-shirt-tk89",
      "striped-pattern-loose-trousers-b5zk",
      "iridescent-yoke-sandals-ou3n",
      "hand-bag-9izs",
    ],
    placements: WOMEN_PLACEMENTS,
    modelDesktopClass: "left-[56%] h-[95%] w-[25%]",
    completeLookClass: "md:left-[58%]",
    theme: {
      section: "bg-[#f2e8e9]",
      backdrop: "bg-[radial-gradient(circle_at_58%_25%,rgba(255,255,255,.82),transparent_30%),linear-gradient(120deg,#faf4f4_0%,#ead7da_46%,#f4e8e7_72%,#e6cfd3_100%)]",
      floor: "border-white/90 shadow-[0_0_32px_rgba(255,255,255,.95)]",
      card: "border-white/80 bg-white/70 shadow-[0_14px_34px_rgba(78,31,42,.1)]",
      accent: "bg-mahalyred",
      shadow: "bg-slate-700/15",
    },
  },
  men: {
    slug: "men",
    title: "Men’s Collection",
    description: "Tailored ease. Everyday utility.\nMade for the modern Cairo rhythm.",
    modelImage: "/images/collections/men/hero-model.png",
    modelAlt: "Man wearing the featured menswear collection",
    featuredProductIds: ["saqr-stone-overshirt", "saqr-navy-knit-polo", "saqr-charcoal-trouser", "saqr-leather-loafer", "saqr-field-bag"],
    allowProductFallback: true,
    placements: [
      { className: "left-[31%] top-[12%]", rotation: -3.5, zIndex: 3 },
      { className: "left-[38%] top-[48%]", rotation: 2.5, zIndex: 4 },
      { className: "right-[24%] top-[7%]", rotation: -2, zIndex: 2 },
      { className: "right-[12%] top-[18%]", rotation: 3.5, zIndex: 3 },
      { className: "right-[3%] top-[45%]", rotation: -3, zIndex: 2 },
    ],
    modelDesktopClass: "left-[56%] h-[95%] w-[25%]",
    completeLookClass: "md:left-[58%]",
    theme: {
      section: "bg-[#e8e4dc]",
      backdrop: "bg-[radial-gradient(circle_at_56%_24%,rgba(255,255,255,.68),transparent_28%),linear-gradient(125deg,#f5f1e9_0%,#d9d1c2_42%,#c8cabd_70%,#aeb4a7_100%)]",
      floor: "border-[#f7f3eb]/80 shadow-[0_0_34px_rgba(255,255,255,.72)]",
      card: "border-[#f7f3eb]/75 bg-[#fbf8f1]/78 shadow-[0_16px_34px_rgba(39,43,36,.14)]",
      accent: "bg-[#3f4a3b]",
      shadow: "bg-[#343a33]/20",
    },
  },
  kids: {
    slug: "kids",
    title: "Kids’ Collection",
    description: "Soft layers. Happy colors.\nMade for every little adventure.",
    modelImage: "/images/collections/kids/hero-model.png",
    modelAlt: "Child wearing the featured kids collection",
    featuredProductIds: ["nabta-cloud-cardigan", "nabta-sky-pocket-tee", "nabta-peach-play-trouser", "nabta-sunstep-sneaker", "nabta-coral-daypack"],
    allowProductFallback: true,
    placements: [
      { className: "left-[31%] top-[12%]", rotation: -4.5, zIndex: 3 },
      { className: "left-[38%] top-[49%]", rotation: 3.5, zIndex: 4 },
      { className: "right-[24%] top-[7%]", rotation: -3, zIndex: 2 },
      { className: "right-[12%] top-[19%]", rotation: 4, zIndex: 3 },
      { className: "right-[3%] top-[45%]", rotation: -3.5, zIndex: 2 },
    ],
    modelDesktopClass: "left-[56%] h-[94%] w-[25%]",
    completeLookClass: "md:left-[58%]",
    theme: {
      section: "bg-[#edf5f5]",
      backdrop: "bg-[radial-gradient(circle_at_55%_23%,rgba(255,255,255,.82),transparent_27%),linear-gradient(125deg,#fff8e9_0%,#dcecf0_38%,#f4dfd6_68%,#e4ecd8_100%)]",
      floor: "border-white/85 shadow-[0_0_34px_rgba(255,255,255,.8)]",
      card: "border-white/85 bg-white/75 shadow-[0_15px_32px_rgba(72,95,96,.13)]",
      accent: "bg-[#e78068]",
      shadow: "bg-[#6c8584]/18",
    },
  },
};
