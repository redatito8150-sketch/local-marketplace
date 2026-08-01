import Header from "@/components/Header";
import Hero from "@/components/Hero";
import NewArrivalsSection from "@/components/home/NewArrivalsSection";
import ShopByMood from "@/components/ShopByMood";
import Sponsored from "@/components/Sponsored";
import Footer from "@/components/Footer";
import EditableSectionFrame from "@/components/admin/EditableSectionFrame";
import PageStudioFlexibleSection from "@/components/home/PageStudioFlexibleSection";
import PageStudioProductGridSection from "@/components/home/PageStudioProductGridSection";
import { HOME_HERO, HOME_HERO_TILES, HOME_NEW_ARRIVALS } from "@/content/home";
import { SHOP_BY_MOOD } from "@/content/shopByMood";
import { getActiveProductsByIds, getAllActiveProducts, getNewArrivals } from "@/lib/data/products";
import { getBestSellingProducts, getTrendingProducts } from "@/lib/data/collections";
import { getBrandSummariesBySlug } from "@/lib/data/brands";
import { PAGE_SECTION_REGISTRY, type PageSectionRecord } from "@/lib/pageStudio/registry";
import type { ReactNode } from "react";
import type { HomeHeroContent, HomeHeroTilesContent, HomeProductSectionContent, Product, ShopByMoodContent } from "@/types";

const VIEW_ALL_HREF: Record<string, string> = { new: "/new-arrivals", trending: "/trending", bestsellers: "/best-sellers", featured: "/shop/all?featured=true", all: "/shop/all" };
// Decorative-only fallback data (Page Studio preview before any real
// content/products exist) — never read from the DB, so the taxonomy
// fields below are filler, not resolved from a real product type.
const PREVIEW_TAXONOMY = { productTypeId: "", mainCategory: "", productGroup: "", productTypeName: "" };
const PREVIEW_AUDIENCE: Record<"men" | "women" | "kids", Product["audience"]> = {
  men: "men",
  women: "women",
  kids: "kids_baby",
};
const PREVIEW_PRODUCTS: Product[] = [
  { id: "preview-stone-overshirt", category: "men", audience: PREVIEW_AUDIENCE.men, ...PREVIEW_TAXONOMY, brand: "Mahaly", name: "Stone Linen Overshirt", price: 1850, currency: "EGP", rating: 5, reviewCount: 18, image: "/images/products/saqr-stone-overshirt/main.webp", sizes: ["S", "M", "L"], colors: [], inStock: true },
  { id: "preview-cloud-cardigan", category: "women", audience: PREVIEW_AUDIENCE.women, ...PREVIEW_TAXONOMY, brand: "Mahaly", name: "Cloud Knit Cardigan", price: 1420, currency: "EGP", rating: 5, reviewCount: 24, image: "/images/products/nabta-cloud-cardigan/main.webp", sizes: ["S", "M", "L"], colors: [], inStock: true },
  { id: "preview-field-bag", category: "men", audience: PREVIEW_AUDIENCE.men, ...PREVIEW_TAXONOMY, brand: "Mahaly", name: "Field Leather Bag", price: 2100, currency: "EGP", rating: 4, reviewCount: 11, image: "/images/products/saqr-field-bag/main.webp", sizes: [], colors: [], inStock: true },
  { id: "preview-sage-jacket", category: "kids", audience: PREVIEW_AUDIENCE.kids, ...PREVIEW_TAXONOMY, brand: "Mahaly", name: "Sage Chore Jacket", price: 1180, currency: "EGP", rating: 5, reviewCount: 16, image: "/images/products/nabta-sage-chore-jacket/main.webp", sizes: ["4Y", "6Y", "8Y"], colors: [], inStock: true },
  { id: "preview-navy-polo", category: "men", audience: PREVIEW_AUDIENCE.men, ...PREVIEW_TAXONOMY, brand: "Mahaly", name: "Navy Knit Polo", price: 1320, currency: "EGP", rating: 4, reviewCount: 21, image: "/images/products/saqr-navy-knit-polo/main.webp", sizes: ["M", "L", "XL"], colors: [], inStock: true },
  { id: "preview-coral-daypack", category: "kids", audience: PREVIEW_AUDIENCE.kids, ...PREVIEW_TAXONOMY, brand: "Mahaly", name: "Coral Daypack", price: 890, currency: "EGP", rating: 5, reviewCount: 13, image: "/images/products/nabta-coral-daypack/main.webp", sizes: [], colors: [], inStock: true },
  { id: "preview-leather-loafer", category: "men", audience: PREVIEW_AUDIENCE.men, ...PREVIEW_TAXONOMY, brand: "Mahaly", name: "Cairo Leather Loafer", price: 2450, currency: "EGP", rating: 5, reviewCount: 29, image: "/images/products/saqr-leather-loafer/main.webp", sizes: ["41", "42", "43"], colors: [], inStock: true },
  { id: "preview-sky-tee", category: "kids", audience: PREVIEW_AUDIENCE.kids, ...PREVIEW_TAXONOMY, brand: "Mahaly", name: "Sky Pocket Tee", price: 620, currency: "EGP", rating: 4, reviewCount: 10, image: "/images/products/nabta-sky-pocket-tee/main.webp", sizes: ["4Y", "6Y", "8Y"], colors: [], inStock: true },
];
function section(sections: PageSectionRecord[], key: string) {
  return sections.find((item) => item.sectionKey === key && item.visible);
}

function normalizeTiles(config: Record<string, unknown> | undefined): HomeHeroTilesContent {
  if (!config) return HOME_HERO_TILES;
  if (Array.isArray(config.items)) {
    const keys = ["women", "men", "kids", "home"] as const;
    const items = config.items as unknown[];
    return Object.fromEntries(keys.map((key, index) => [
      key,
      { ...HOME_HERO_TILES[key], ...(items[index] as object ?? {}), image: HOME_HERO_TILES[key].image },
    ])) as HomeHeroTilesContent;
  }
  const merged = { ...HOME_HERO_TILES, ...config } as HomeHeroTilesContent;
  return Object.fromEntries(
    (["women", "men", "kids", "home"] as const).map((key) => [key, { ...merged[key], image: HOME_HERO_TILES[key].image }])
  ) as HomeHeroTilesContent;
}

async function productRows(config: Record<string, unknown>, allProducts: boolean) {
  const limit = Number(config.itemCount ?? config.limit ?? 10);
  if (Array.isArray(config.productIds)) return getActiveProductsByIds(config.productIds.filter((id): id is string => typeof id === "string"), limit);
  if (allProducts) return getAllActiveProducts(limit, (config.sorting as "newest" | "price-asc" | "price-desc" | "top-rated") ?? "newest", Boolean(config.featuredOnly));
  const source = String(config.source ?? "new");
  if (source === "trending") return getTrendingProducts(limit);
  if (source === "bestsellers") return getBestSellingProducts(limit);
  if (source === "all" || source === "featured") return getAllActiveProducts(limit, "newest", source === "featured");
  return getNewArrivals(limit);
}

export default async function PageStudioHomepage({ sections, editMode = false }: { sections: PageSectionRecord[]; editMode?: boolean }) {
  const heroSection = section(sections, "home_hero");
  const tileSection = section(sections, "home_hero_tiles");
  const rawHero = heroSection?.config ?? HOME_HERO;
  const heroContent: HomeHeroContent = {
    headingLines: Array.isArray(rawHero.headingLines) ? rawHero.headingLines.filter((line): line is string => typeof line === "string") : HOME_HERO.headingLines,
    subheading: typeof rawHero.subheading === "string" ? rawHero.subheading : HOME_HERO.subheading,
    ctaLabel: typeof rawHero.ctaLabel === "string" ? rawHero.ctaLabel : HOME_HERO.ctaLabel,
    ctaHref: typeof rawHero.ctaHref === "string" ? rawHero.ctaHref : HOME_HERO.ctaHref,
  };
  const heroTiles = normalizeTiles(tileSection?.config);
  const productSectionTypes = ["product_carousel", "product_grid", "all_products_preview", "custom_product_collection"];
  const renderable = sections.filter((item) =>
    item.visible &&
    !["home_hero", "home_hero_tiles", "home_benefits"].includes(item.sectionKey) &&
    !productSectionTypes.includes(item.sectionType) &&
    item.sectionType !== "mood_tiles" &&
    // Sponsorship no longer needs a Page Studio row to appear — it's
    // rendered unconditionally below (see sponsoredHomeBanner), driven
    // entirely by which brand(s) the admin marked Sponsored.
    item.sectionType !== "featured_brand"
  );
  // Keep this design-preview branch independent from the live catalog while
  // it runs locally alongside other worktrees. The real product sections can
  // be reconnected when the design is approved.
  const homepageProducts = PREVIEW_PRODUCTS;
  const newestProducts = homepageProducts.slice(0, 10);
  const moodSection = section(sections, "shop_by_mood");
  const moodTiles = Array.isArray(moodSection?.config.items)
    ? moodSection.config.items as ShopByMoodContent
    : SHOP_BY_MOOD;
  const prepared = await Promise.all(renderable.map(async (item) => {
    if (["product_carousel", "product_grid", "all_products_preview", "custom_product_collection"].includes(item.sectionType)) {
      return { item, products: await productRows(item.config, item.sectionType === "all_products_preview") };
    }
    if (item.sectionType === "brand_carousel" || item.sectionType === "sponsored_brands") {
      const slugs = Array.isArray(item.config.brandSlugs) ? item.config.brandSlugs.filter((slug): slug is string => typeof slug === "string") : [];
      return { item, brands: await getBrandSummariesBySlug(slugs) };
    }
    return { item };
  }));

  const sectionIds = sections.filter((item) => item.visible).map((item) => item.id);
  const frame = (item: PageSectionRecord, node: ReactNode) => editMode ? (
    <EditableSectionFrame
      key={item.id}
      pageKey={item.pageKey}
      sectionId={item.id}
      label={PAGE_SECTION_REGISTRY[item.sectionType].label}
      editorHref={`/admin/page-studio/${item.pageKey}#section-${item.id}`}
      sectionIds={sectionIds}
      index={sectionIds.indexOf(item.id)}
      canHide={!item.isRequired}
      config={item.config}
      visible={item.visible}
    >
      {node}
    </EditableSectionFrame>
  ) : node;

  const hero = <Hero content={heroContent} tiles={heroTiles} />;

  return <main className="home-nile-background min-h-screen"><Header />{heroSection ? frame(heroSection, hero) : hero}
    <NewArrivalsSection title="New Arrivals" products={newestProducts} viewAllHref="/new-arrivals" />
    {moodSection ? frame(moodSection, <ShopByMood tiles={moodTiles} />) : <ShopByMood tiles={moodTiles} />}
    <Sponsored />
    <NewArrivalsSection title="Explore All Products" products={homepageProducts} viewAllHref="/shop/all" />
    {prepared.map((entry) => {
    const { item } = entry;
    if ("products" in entry && entry.products) {
      const config = item.config as unknown as HomeProductSectionContent & { itemCount?: number; displayStyle?: string };
      const isAll = item.sectionType === "all_products_preview";
      if (item.sectionType === "product_grid" || config.displayStyle === "grid") return frame(item, <PageStudioProductGridSection key={item.id} title={config.title ?? HOME_NEW_ARRIVALS.title} products={entry.products} viewAllHref={isAll ? "/shop/all" : (VIEW_ALL_HREF[config.source] ?? "/shop/all")} />);
      return frame(item, <NewArrivalsSection key={item.id} title={config.title ?? HOME_NEW_ARRIVALS.title} products={entry.products} viewAllHref={isAll ? "/shop/all" : (VIEW_ALL_HREF[config.source] ?? "/shop/all")} />);
    }
    if (item.sectionType === "mood_tiles") {
      const value = item.config.items;
      const tiles = Array.isArray(value) ? value as ShopByMoodContent : SHOP_BY_MOOD;
      return frame(item, <ShopByMood key={item.id} tiles={tiles} />);
    }
    if ("brands" in entry) return frame(item, <PageStudioFlexibleSection key={item.id} type={item.sectionType} config={item.config} brands={entry.brands} />);
    if (["promotional_banner", "editorial_image", "text_block", "newsletter"].includes(item.sectionType)) return frame(item, <PageStudioFlexibleSection key={item.id} type={item.sectionType} config={item.config} />);
    return null;
  })}<Footer homeGradient /></main>;
}
