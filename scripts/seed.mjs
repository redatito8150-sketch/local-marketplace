// scripts/seed.mjs
//
// Populates Supabase with the starter catalog (same products/brands that
// used to live in data/products.ts and data/brand.ts).
//
// Run locally (NEVER in a browser or committed CI log) with the
// service_role key, which is the only key allowed to bypass Row Level
// Security for these inserts:
//
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
//   node scripts/seed.mjs
//
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── Brands ───────────────────────────────────────────────────────────────

const genericBadges = [
  { icon: "location", label: "Cairo" },
  { icon: "flag", label: "Made in Egypt" },
  { icon: "truck", label: "Ships in 2–4 Days" },
  { icon: "leaf", label: "Sustainable Fabrics" },
];

const genericValues = [
  { icon: "flag", title: "Made in Egypt", description: "Every piece is produced locally by Egyptian makers." },
  { icon: "package", title: "Small Batch Production", description: "Limited runs keep quality high and waste close to zero." },
  { icon: "leaf", title: "Natural Materials", description: "Responsibly sourced fabrics and materials, always." },
  { icon: "pen", title: "Designed in Egypt", description: "Every piece begins as a sketch inspired by the country itself." },
];

function genericCategoryTabs() {
  return [
    { id: "shop-all", label: "Shop All" },
    { id: "new-arrivals", label: "New Arrivals" },
    { id: "essentials", label: "Essentials" },
    { id: "our-story", label: "Our Story" },
  ];
}

const BRANDS = [
  {
    slug: "marga-studio",
    name: "MARGA STUDIO",
    tagline: "Timeless linen clothing designed and made in Cairo.",
    category: "Premium Linen Fashion",
    founded_year: 2022,
    city: "Cairo",
    hero_image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=2000&q=80",
    about_description:
      "MARGA Studio creates timeless linen clothing inspired by Cairo's architecture, light, and everyday rhythm. Every piece is designed and produced in Egypt using premium natural fabrics in limited quantities.",
    about_image: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&q=80",
    story_image: "https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=1000&q=80",
    story_body:
      "Founded in Cairo, MARGA Studio celebrates Egyptian craftsmanship through timeless design. The brand collaborates with local artisans and carefully selected natural fabrics to produce modern wardrobe essentials in limited quantities.",
    info_badges: genericBadges,
    category_tabs: [
      { id: "shop-all", label: "Shop All" },
      { id: "new-arrivals", label: "New Arrivals" },
      { id: "linen-essentials", label: "Linen Essentials" },
      { id: "summer-2026", label: "Summer 2026" },
      { id: "our-story", label: "Our Story" },
    ],
    values: genericValues,
    similar_brand_slugs: ["nola", "kai", "studio-nile", "sahara-form"],
  },
  {
    slug: "nola",
    name: "NOLA",
    tagline: "Contemporary womenswear rooted in Cairo's modern rhythm.",
    category: "Contemporary Womenswear",
    founded_year: 2021,
    city: "Cairo",
    hero_image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=2000&q=80",
    about_description: "NOLA creates contemporary womenswear rooted in Egyptian craftsmanship, designed for everyday life and made in limited quantities.",
    about_image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&q=80",
    story_image: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1000&q=80",
    story_body: "Founded in Cairo, NOLA celebrates Egyptian craftsmanship through considered design. The brand works with local makers and carefully selected materials to produce modern essentials in limited quantities.",
    info_badges: genericBadges,
    category_tabs: genericCategoryTabs(),
    values: genericValues,
    similar_brand_slugs: ["marga-studio", "kai", "studio-nile", "sahara-form"],
  },
  {
    slug: "kai",
    name: "KAI",
    tagline: "Minimal accessories crafted for everyday wear.",
    category: "Minimal Accessories",
    founded_year: 2023,
    city: "Cairo",
    hero_image: "https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=2000&q=80",
    about_description: "KAI creates minimal accessories rooted in Egyptian craftsmanship, designed for everyday life and made in limited quantities.",
    about_image: "https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=800&q=80",
    story_image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=1000&q=80",
    story_body: "Founded in Cairo, KAI celebrates Egyptian craftsmanship through considered design. The brand works with local makers and carefully selected materials to produce modern essentials in limited quantities.",
    info_badges: genericBadges,
    category_tabs: genericCategoryTabs(),
    values: genericValues,
    similar_brand_slugs: ["marga-studio", "nola", "studio-nile", "sahara-form"],
  },
  {
    slug: "studio-nile",
    name: "STUDIO NILE",
    tagline: "Modern menswear built on considered tailoring.",
    category: "Menswear",
    founded_year: 2020,
    city: "Giza",
    hero_image: "https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?w=2000&q=80",
    about_description: "STUDIO NILE creates modern menswear rooted in Egyptian craftsmanship, designed for everyday life and made in limited quantities.",
    about_image: "https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=800&q=80",
    story_image: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=1000&q=80",
    story_body: "Founded in Cairo, STUDIO NILE celebrates Egyptian craftsmanship through considered design. The brand works with local makers and carefully selected materials to produce modern essentials in limited quantities.",
    info_badges: genericBadges,
    category_tabs: genericCategoryTabs(),
    values: genericValues,
    similar_brand_slugs: ["marga-studio", "nola", "kai", "sahara-form"],
  },
  {
    slug: "sahara-form",
    name: "SAHARA FORM",
    tagline: "Ceramics and home objects shaped by the desert.",
    category: "Home & Ceramics",
    founded_year: 2019,
    city: "Cairo",
    hero_image: "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=2000&q=80",
    about_description: "SAHARA FORM creates ceramics and home objects rooted in Egyptian craftsmanship, designed for everyday life and made in limited quantities.",
    about_image: "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=800&q=80",
    story_image: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1000&q=80",
    story_body: "Founded in Cairo, SAHARA FORM celebrates Egyptian craftsmanship through considered design. The brand works with local makers and carefully selected materials to produce modern essentials in limited quantities.",
    info_badges: genericBadges,
    category_tabs: genericCategoryTabs(),
    values: genericValues,
    similar_brand_slugs: ["marga-studio", "nola", "kai", "studio-nile"],
  },
  {
    slug: "the-cairo-atelier",
    name: "THE CAIRO ATELIER",
    tagline: "Bespoke tailoring for the modern Cairene wardrobe.",
    category: "Made-to-Measure",
    founded_year: 2018,
    city: "Cairo",
    hero_image: "https://images.unsplash.com/photo-1591369822096-ffd140ec948f?w=2000&q=80",
    about_description: "THE CAIRO ATELIER creates made-to-measure pieces rooted in Egyptian craftsmanship, designed for everyday life and made in limited quantities.",
    about_image: "https://images.unsplash.com/photo-1591369822096-ffd140ec948f?w=800&q=80",
    story_image: "https://images.unsplash.com/photo-1544923246-77307dd654cb?w=1000&q=80",
    story_body: "Founded in Cairo, THE CAIRO ATELIER celebrates Egyptian craftsmanship through considered design. The brand works with local makers and carefully selected materials to produce modern essentials in limited quantities.",
    info_badges: genericBadges,
    category_tabs: genericCategoryTabs(),
    values: genericValues,
    similar_brand_slugs: ["marga-studio", "nola", "kai", "studio-nile"],
  },
];

// ── Category products (women / men / kids) ──────────────────────────────

const CATEGORY_PRODUCTS = [
  { id: "w-1", category: "women", brand_name: "AUREUM", name: "Linen Blend Oversized Shirt", price: 129.0, rating: 5, review_count: 24, image: "https://images.unsplash.com/photo-1596783074918-c84cb06531ca?w=600&q=80" },
  { id: "w-2", category: "women", brand_name: "NOYA", name: "Ribbed Knit Maxi Dress", price: 189.0, rating: 5, review_count: 18, image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=600&q=80" },
  { id: "w-3", category: "women", brand_name: "ÉLAN ATELIER", name: "Tailored Linen Blazer", price: 249.0, rating: 5, review_count: 31, image: "https://images.unsplash.com/photo-1591369822096-ffd140ec948f?w=600&q=80" },
  { id: "w-4", category: "women", brand_name: "KIVARI", name: "Asymmetric One Shoulder Top", price: 99.0, rating: 5, review_count: 12, image: "https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=600&q=80" },
  { id: "w-5", category: "women", brand_name: "AUREUM", name: "Wide Leg Tailored Trousers", price: 159.0, rating: 4, review_count: 9, image: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&q=80" },
  { id: "w-6", category: "women", brand_name: "NOYA", name: "Silk Slip Midi Dress", price: 219.0, rating: 5, review_count: 27, image: "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?w=600&q=80" },
  { id: "w-7", category: "women", brand_name: "OTHER BRANDS", name: "Cropped Wool Cardigan", price: 139.0, rating: 4, review_count: 15, image: "https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=600&q=80" },
  { id: "w-8", category: "women", brand_name: "KIVARI", name: "Belted Trench Coat", price: 289.0, rating: 5, review_count: 22, image: "https://images.unsplash.com/photo-1548624313-0396c75f6a70?w=600&q=80" },

  { id: "m-1", category: "men", brand_name: "AUREUM", name: "Merino Wool Crewneck Sweater", price: 149.0, rating: 5, review_count: 19, image: "https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=600&q=80" },
  { id: "m-2", category: "men", brand_name: "NOYA", name: "Tailored Cotton Chinos", price: 119.0, rating: 4, review_count: 14, image: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=600&q=80" },
  { id: "m-3", category: "men", brand_name: "ÉLAN ATELIER", name: "Structured Wool Overcoat", price: 329.0, rating: 5, review_count: 26, image: "https://images.unsplash.com/photo-1544923246-77307dd654cb?w=600&q=80" },
  { id: "m-4", category: "men", brand_name: "KIVARI", name: "Relaxed Fit Linen Shirt", price: 89.0, rating: 4, review_count: 11, image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&q=80" },
  { id: "m-5", category: "men", brand_name: "AUREUM", name: "Slim Fit Denim Jeans", price: 139.0, rating: 4, review_count: 17, image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=600&q=80" },
  { id: "m-6", category: "men", brand_name: "NOYA", name: "Quilted Bomber Jacket", price: 219.0, rating: 5, review_count: 23, image: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600&q=80" },
  { id: "m-7", category: "men", brand_name: "ÉLAN ATELIER", name: "Cotton Oxford Shirt", price: 99.0, rating: 4, review_count: 14, image: "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=600&q=80" },
  { id: "m-8", category: "men", brand_name: "OTHER BRANDS", name: "Knit Polo Shirt", price: 79.0, rating: 4, review_count: 9, image: "https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=600&q=80" },

  { id: "k-1", category: "kids", brand_name: "AUREUM", name: "Organic Cotton Playsuit", price: 49.0, rating: 5, review_count: 8, image: "https://images.unsplash.com/photo-1519457851160-6d5b0c944241?w=600&q=80" },
  { id: "k-2", category: "kids", brand_name: "NOYA", name: "Knit Cardigan Set", price: 59.0, rating: 5, review_count: 13, image: "https://images.unsplash.com/photo-1503457574465-52ee3dbedcd6?w=600&q=80" },
  { id: "k-3", category: "kids", brand_name: "ÉLAN ATELIER", name: "Corduroy Overalls", price: 69.0, rating: 4, review_count: 6, image: "https://images.unsplash.com/photo-1471286174890-9c112ffca5b4?w=600&q=80" },
  { id: "k-4", category: "kids", brand_name: "KIVARI", name: "Cotton Jersey Dress", price: 45.0, rating: 4, review_count: 5, image: "https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=600&q=80" },
  { id: "k-5", category: "kids", brand_name: "AUREUM", name: "Striped Cotton Romper", price: 39.0, rating: 5, review_count: 10, image: "https://images.unsplash.com/photo-1522771930-78848d9293e8?w=600&q=80" },
  { id: "k-6", category: "kids", brand_name: "NOYA", name: "Quilted Puffer Jacket", price: 65.0, rating: 4, review_count: 7, image: "https://images.unsplash.com/photo-1522771930-78848d9293e9?w=600&q=80" },
  { id: "k-7", category: "kids", brand_name: "ÉLAN ATELIER", name: "Linen Button-Up Shirt", price: 42.0, rating: 4, review_count: 4, image: "https://images.unsplash.com/photo-1519238425481-4e2b9e2d6b8c?w=600&q=80" },
  { id: "k-8", category: "kids", brand_name: "OTHER BRANDS", name: "Fleece Pull-On Pants", price: 35.0, rating: 4, review_count: 6, image: "https://images.unsplash.com/photo-1503457574465-52ee3dbedcd7?w=600&q=80" },
].map((p) => ({
  ...p,
  currency: "USD",
  images: [p.image],
  colors: [{ name: "Black", hex: "#111111" }, { name: "Beige", hex: "#EDE6D9" }, { name: "Taupe", hex: "#8C8172" }],
  sizes: ["XS", "S", "M", "L", "XL"],
  description: `${p.name} from ${p.brand_name} — a considered, everyday piece cut from premium materials and designed to move with you.`,
  details: [`Brand: ${p.brand_name}`, "Premium natural-blend fabric", "Designed in limited quantities"],
  care_instructions: ["Machine wash cold with like colors", "Do not bleach", "Tumble dry low", "Warm iron if needed"],
  shipping_returns: "Free standard delivery on orders over $25. Easy 30-day returns — unworn items with tags attached.",
  sku: `LC-${p.id.toUpperCase()}`,
  in_stock: true,
  is_new: false,
}));

// ── Marga Studio's own catalog ───────────────────────────────────────────

const MARGA_PRODUCTS = [
  { id: "p1", name: "Linen Oversized Shirt", price: 1450, colors: ["#EDE6D9", "#111111", "#8C8172"], image: "https://images.unsplash.com/photo-1596783074918-c84cb06531ca?w=700&q=80", isNew: true },
  { id: "p2", name: "Wide Leg Linen Pants", price: 1700, colors: ["#111111", "#8C8172"], image: "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=700&q=80" },
  { id: "p3", name: "Minimal Linen Dress", price: 2100, colors: ["#EDE6D9", "#111111"], image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=700&q=80", isNew: true },
  { id: "p4", name: "Relaxed Linen Blazer", price: 2450, colors: ["#8C8172", "#111111", "#EDE6D9"], image: "https://images.unsplash.com/photo-1591369822096-ffd140ec948f?w=700&q=80" },
  { id: "p5", name: "Linen Wrap Skirt", price: 1350, colors: ["#EDE6D9", "#8C8172"], image: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=700&q=80" },
  { id: "p6", name: "Sleeveless Linen Top", price: 980, colors: ["#111111", "#EDE6D9"], image: "https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=700&q=80", isNew: true },
  { id: "p7", name: "Linen Co-ord Set", price: 2850, colors: ["#EDE6D9", "#8C8172", "#111111"], image: "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?w=700&q=80" },
  { id: "p8", name: "Everyday Linen Shirt", price: 1250, colors: ["#111111", "#EDE6D9"], image: "https://images.unsplash.com/photo-1548624313-0396c75f6a70?w=700&q=80" },
].map((p) => ({
  id: p.id,
  category: null,
  brand_name: "MARGA STUDIO",
  brand_slug: "marga-studio",
  name: p.name,
  price: p.price,
  currency: "EGP",
  rating: 5,
  review_count: 8 + (p.id.length % 20),
  image: p.image,
  images: [p.image, "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=900&q=80"],
  colors: p.colors.map((hex) => ({
    name: { "#111111": "Black", "#EDE6D9": "Beige", "#8C8172": "Taupe" }[hex] ?? "Natural",
    hex,
  })),
  sizes: ["XS", "S", "M", "L", "XL"],
  description: `${p.name} by MARGA STUDIO — timeless linen clothing designed and made in Cairo.`,
  details: ["Brand: MARGA STUDIO", "Made in Cairo, Egypt", "Natural, breathable fabric", "Produced in small batches"],
  care_instructions: ["Hand wash cold or gentle machine cycle", "Do not bleach", "Line dry in shade", "Warm iron on reverse if needed"],
  shipping_returns: "Ships in 2–4 days across Egypt. Easy 14-day returns on unworn items with tags attached.",
  sku: `MARGA-STUDIO-${p.id.toUpperCase()}`,
  in_stock: true,
  is_new: !!p.isNew,
}));

// ── Generic 4-item catalogs for the other 5 brands ───────────────────────

function genericBrandProducts(brandSlug, brandName, image) {
  const names = ["Signature Piece", "Everyday Essential", "Studio Favorite", "Limited Edition"];
  return names.map((name, i) => ({
    id: `${brandSlug}-${i + 1}`,
    category: null,
    brand_name: brandName,
    brand_slug: brandSlug,
    name,
    price: 750 + i * 350,
    currency: "EGP",
    rating: 5,
    review_count: 12,
    image,
    images: [image],
    colors: [{ name: "Black", hex: "#111111" }, { name: "Beige", hex: "#EDE6D9" }],
    sizes: ["XS", "S", "M", "L", "XL"],
    description: `${name} by ${brandName} — Egyptian craftsmanship in a modern silhouette.`,
    details: [`Brand: ${brandName}`, "Made in Cairo, Egypt", "Natural materials", "Produced in small batches"],
    care_instructions: ["Hand wash cold or gentle machine cycle", "Do not bleach", "Line dry in shade"],
    shipping_returns: "Ships in 2–4 days across Egypt. Easy 14-day returns on unworn items with tags attached.",
    sku: `${brandSlug.toUpperCase()}-${(i + 1).toString().padStart(2, "0")}`,
    in_stock: true,
    is_new: i === 0,
  }));
}

const OTHER_BRAND_PRODUCTS = [
  ...genericBrandProducts("nola", "NOLA", "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&q=80"),
  ...genericBrandProducts("kai", "KAI", "https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=800&q=80"),
  ...genericBrandProducts("studio-nile", "STUDIO NILE", "https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=800&q=80"),
  ...genericBrandProducts("sahara-form", "SAHARA FORM", "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=800&q=80"),
  ...genericBrandProducts("the-cairo-atelier", "THE CAIRO ATELIER", "https://images.unsplash.com/photo-1591369822096-ffd140ec948f?w=800&q=80"),
];

const ALL_PRODUCTS = [...CATEGORY_PRODUCTS, ...MARGA_PRODUCTS, ...OTHER_BRAND_PRODUCTS];

// ── Run ───────────────────────────────────────────────────────────────────

async function seed() {
  console.log(`Seeding ${BRANDS.length} brands...`);
  const { error: brandsError } = await supabase.from("brands").upsert(BRANDS, { onConflict: "slug" });
  if (brandsError) throw brandsError;

  console.log(`Seeding ${ALL_PRODUCTS.length} products...`);
  const { error: productsError } = await supabase.from("products").upsert(ALL_PRODUCTS, { onConflict: "id" });
  if (productsError) throw productsError;

  console.log("Done. Brands and products are live in Supabase.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
