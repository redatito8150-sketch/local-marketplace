// Review-only seed for the Men + Kids collection launch.
// This script never runs as part of build/CI. Production requires a second,
// explicit ALLOW_PRODUCTION_COLLECTION_SEED=true confirmation.
//
// Explicit preview/development usage:
//   SEED_TARGET=preview ALLOW_COLLECTION_SEED=true \
//   SUPABASE_URL=https://your-preview-project.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/seed-men-kids-collections.mjs

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SEED_TARGET,
  ALLOW_COLLECTION_SEED,
  ALLOW_PRODUCTION_COLLECTION_SEED,
} = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
if (ALLOW_COLLECTION_SEED !== "true") throw new Error("Set ALLOW_COLLECTION_SEED=true to confirm this manual seed.");
const allowedNonProductionTargets = new Set(["local", "development", "preview"]);
const productionApproved =
  SEED_TARGET === "production" && ALLOW_PRODUCTION_COLLECTION_SEED === "true";
if (!allowedNonProductionTargets.has(SEED_TARGET ?? "") && !productionApproved) {
  throw new Error(
    "SEED_TARGET must be local, development, or preview. Production additionally requires ALLOW_PRODUCTION_COLLECTION_SEED=true."
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const badges = (city) => [
  { icon: "location", label: city },
  { icon: "flag", label: "Made in Egypt" },
  { icon: "truck", label: "Ships in 2–4 Days" },
  { icon: "leaf", label: "Thoughtful Materials" },
];
const tabs = [
  { id: "shop-all", label: "Shop All" },
  { id: "new-arrivals", label: "New Arrivals" },
  { id: "essentials", label: "Essentials" },
  { id: "our-story", label: "Our Story" },
];

const BRANDS = [
  {
    slug: "saqr-cairo", name: "SAQR CAIRO", tagline: "Considered menswear for the modern Cairo rhythm.", category: "Contemporary Menswear",
    founded_year: 2024, city: "Cairo", hero_image: "/images/brands/saqr-cairo/campaign.webp", logo_image: "/images/brands/saqr-cairo/logo.svg",
    about_description: "SAQR Cairo builds a compact wardrobe around precise proportions, breathable Egyptian fabrics, and an understated palette drawn from the city's stone, shade, and river light.",
    about_image: "/images/brands/saqr-cairo/campaign.webp", story_image: "/images/brands/saqr-cairo/campaign.webp", story_image_2: "/images/collections/men/hero-model.png",
    story_body: "Founded by a small team of Cairo designers and pattern makers, SAQR began with one idea: smart clothing should move easily through a real day. Each piece is cut and finished locally in limited runs, balancing relaxed utility with quiet tailoring.",
    info_badges: badges("Cairo"), category_tabs: tabs, active_tab: "shop-all",
    values: [
      { icon: "pen", title: "Measured Design", description: "Every seam and proportion earns its place." },
      { icon: "flag", title: "Made Locally", description: "Cut and finished with independent Cairo workshops." },
      { icon: "leaf", title: "Natural Comfort", description: "Breathable cotton and linen-led fabrications." },
      { icon: "package", title: "Limited Runs", description: "Smaller batches support quality and reduce excess." },
    ],
    similar_brand_slugs: ["studio-nile", "the-cairo-atelier", "marga-studio"],
    shop_the_look: [
      { image: "/images/products/saqr-stone-overshirt/main.webp", title: "Stone Layers", href: "/product/saqr-stone-overshirt" },
      { image: "/images/products/saqr-charcoal-trouser/main.webp", title: "City Tailoring", href: "/product/saqr-charcoal-trouser" },
    ],
  },
  {
    slug: "nabta-kids", name: "NABTA KIDS", tagline: "Soft everyday clothes made for growing adventures.", category: "Premium Kidswear",
    founded_year: 2025, city: "Alexandria", hero_image: "/images/brands/nabta-kids/campaign.webp", logo_image: "/images/brands/nabta-kids/logo.svg",
    about_description: "NABTA Kids makes soft, practical clothes that give children room to move and parents fewer things to worry about. Natural fabrics, gentle color, and useful details define every piece.",
    about_image: "/images/brands/nabta-kids/campaign.webp", story_image: "/images/brands/nabta-kids/campaign.webp", story_image_2: "/images/collections/kids/hero-model.png",
    story_body: "NABTA—Arabic for a young sprout—was started by two Alexandria mothers who wanted locally made children's essentials that could handle play, washing, sharing, and growing. The collection is produced in small batches with comfort checked at every stage.",
    info_badges: badges("Alexandria"), category_tabs: tabs, active_tab: "shop-all",
    values: [
      { icon: "leaf", title: "Soft by Nature", description: "Gentle cotton-led fabrics selected for daily comfort." },
      { icon: "package", title: "Built for Repeat Wear", description: "Practical finishes for play, washing, and hand-me-downs." },
      { icon: "flag", title: "Made in Egypt", description: "Designed in Alexandria and made with local partners." },
      { icon: "pen", title: "Child-Led Fit", description: "Easy shapes with room to move and grow." },
    ],
    similar_brand_slugs: ["marga-studio", "nola", "studio-nile"],
    shop_the_look: [
      { image: "/images/products/nabta-cloud-cardigan/main.webp", title: "Soft Layers", href: "/product/nabta-cloud-cardigan" },
      { image: "/images/products/nabta-coral-daypack/main.webp", title: "Little Adventures", href: "/product/nabta-coral-daypack" },
    ],
  },
];

const shared = {
  currency: "EGP", rating: 5, review_count: 0, in_stock: true, is_new: true, is_unisex: false,
  unavailable_sizes: [], track_inventory: true, status: "published", paused_by_brand: false,
  shipping_returns: "Ships in 2–4 days across Egypt. Easy 14-day returns on unworn items with tags attached.",
  publish_date: "2026-07-21T00:00:00.000Z",
};

function product(input) {
  const { campaign, care, ...row } = input;
  const image = `/images/products/${row.id}/main.webp`;
  return {
    ...shared,
    ...row,
    image,
    images: [image, campaign],
    care_instructions: care,
  };
}

const MEN = [
  product({ id: "saqr-stone-overshirt", name: "Stone Canvas Overshirt", brand_name: "SAQR CAIRO", brand_slug: "saqr-cairo", category: "men", price: 2450, compare_at_price: 2850, product_category: "Clothing", product_type: "Jackets", collection: "City Foundations", material: "Cotton Canvas", fit: "Relaxed", colors: [{ name: "Warm Stone", hex: "#B7A58C" }, { name: "Deep Olive", hex: "#4A5142" }], sizes: ["S", "M", "L", "XL"], description: "A softly structured overshirt that bridges tailoring and utility.", details: ["Two buttoned chest pockets", "Unlined for year-round layering", "Locally cut and finished"], care: ["Machine wash cold", "Line dry in shade", "Warm iron"], sku: "SAQR-OS-001", campaign: "/images/brands/saqr-cairo/campaign.webp", featured: true }),
  product({ id: "saqr-navy-knit-polo", name: "Nile Knit Polo", brand_name: "SAQR CAIRO", brand_slug: "saqr-cairo", category: "men", price: 1650, product_category: "Clothing", product_type: "Tops", collection: "City Foundations", material: "Cotton Knit", fit: "Regular", colors: [{ name: "Muted Navy", hex: "#232D43" }, { name: "Soft Sand", hex: "#D6C5A9" }], sizes: ["S", "M", "L", "XL"], description: "A fine-gauge cotton polo with a clean open collar and easy drape.", details: ["Breathable fine knit", "Ribbed cuff and hem", "Three-button placket"], care: ["Hand wash cold", "Dry flat", "Do not tumble dry"], sku: "SAQR-KP-002", campaign: "/images/brands/saqr-cairo/campaign.webp", featured: true }),
  product({ id: "saqr-charcoal-trouser", name: "Kasr Tailored Trouser", brand_name: "SAQR CAIRO", brand_slug: "saqr-cairo", category: "men", price: 2200, product_category: "Clothing", product_type: "Trousers", collection: "City Foundations", material: "Cotton Twill", fit: "Tapered", colors: [{ name: "Charcoal", hex: "#353535" }, { name: "Stone", hex: "#968B7A" }], sizes: ["30", "32", "34", "36", "38"], description: "A modern pleated trouser with room through the seat and a neat taper.", details: ["Single front pleat", "Half-lined waistband", "Four functional pockets"], care: ["Gentle machine wash cold", "Line dry", "Steam to reshape"], sku: "SAQR-TR-003", campaign: "/images/brands/saqr-cairo/campaign.webp", featured: true }),
  product({ id: "saqr-leather-loafer", name: "Qasr Leather Loafer", brand_name: "SAQR CAIRO", brand_slug: "saqr-cairo", category: "men", price: 2950, product_category: "Shoes", product_type: "Loafers", collection: "City Foundations", material: "Leather", fit: "Regular", colors: [{ name: "Dark Brown", hex: "#3A281E" }, { name: "Black", hex: "#171717" }], sizes: ["40", "41", "42", "43", "44", "45"], description: "A polished penny loafer handmade with a flexible leather sole.", details: ["Full-grain leather upper", "Leather lining", "Cushioned heel pad"], care: ["Wipe with a soft dry cloth", "Condition leather occasionally", "Store with shoe trees"], sku: "SAQR-LF-004", campaign: "/images/brands/saqr-cairo/campaign.webp", featured: true }),
  product({ id: "saqr-field-bag", name: "Wadi Field Bag", brand_name: "SAQR CAIRO", brand_slug: "saqr-cairo", category: "men", price: 1850, product_category: "Accessories", product_type: "Bags", collection: "City Foundations", material: "Waxed Cotton", fit: "One Size", colors: [{ name: "Deep Olive", hex: "#454A32" }, { name: "Charcoal", hex: "#3E403E" }], sizes: ["One Size"], description: "A compact crossbody bag designed around daily essentials.", details: ["Adjustable webbing strap", "Internal phone pocket", "Water-resistant waxed finish"], care: ["Spot clean only", "Do not machine wash", "Air dry naturally"], sku: "SAQR-BG-005", campaign: "/images/brands/saqr-cairo/campaign.webp", featured: true }),
  product({ id: "saqr-sand-linen-blazer", name: "Garden City Linen Blazer", brand_name: "SAQR CAIRO", brand_slug: "saqr-cairo", category: "men", price: 3850, compare_at_price: 4300, product_category: "Clothing", product_type: "Blazers", collection: "Light Structure", material: "Linen", fit: "Relaxed Tailored", colors: [{ name: "Sand", hex: "#CDBA9B" }, { name: "Warm Stone", hex: "#AA9D88" }], sizes: ["S", "M", "L", "XL"], description: "An unstructured linen blazer made for warm days and easy evenings.", details: ["Half-lined construction", "Natural horn-effect buttons", "Patch pockets"], care: ["Dry clean recommended", "Steam lightly", "Store on a shaped hanger"], sku: "SAQR-BL-006", campaign: "/images/brands/saqr-cairo/campaign.webp", featured: false }),
];

const KIDS = [
  product({ id: "nabta-cloud-cardigan", name: "Cloud Cable Cardigan", brand_name: "NABTA KIDS", brand_slug: "nabta-kids", category: "kids", price: 1150, product_category: "Clothing", product_type: "Cardigans", collection: "Everyday Garden", material: "Cotton Knit", fit: "Easy", colors: [{ name: "Warm Cream", hex: "#F1E6D0" }, { name: "Sky Blue", hex: "#A9CEE8" }], sizes: ["4Y", "6Y", "8Y", "10Y", "12Y"], description: "A soft cotton cable cardigan with easy wooden-look buttons.", details: ["Soft cotton yarn", "Ribbed cuffs", "Roomy layering fit"], care: ["Machine wash cold in a laundry bag", "Dry flat", "Do not bleach"], sku: "NABTA-CD-001", campaign: "/images/brands/nabta-kids/campaign.webp", featured: true }),
  product({ id: "nabta-sky-pocket-tee", name: "Sky Pocket Tee", brand_name: "NABTA KIDS", brand_slug: "nabta-kids", category: "kids", price: 650, product_category: "Clothing", product_type: "Tops", collection: "Everyday Garden", material: "Organic Cotton", fit: "Relaxed", colors: [{ name: "Sky Blue", hex: "#8FC4E6" }, { name: "Warm Cream", hex: "#F3E8D5" }], sizes: ["4Y", "6Y", "8Y", "10Y", "12Y"], description: "A breathable everyday tee with a useful little chest pocket.", details: ["Organic cotton jersey", "Tag-free neckline", "Pre-washed softness"], care: ["Machine wash cold", "Tumble dry low", "Wash with similar colors"], sku: "NABTA-TS-002", campaign: "/images/brands/nabta-kids/campaign.webp", featured: true }),
  product({ id: "nabta-peach-play-trouser", name: "Peach Play Trouser", brand_name: "NABTA KIDS", brand_slug: "nabta-kids", category: "kids", price: 900, product_category: "Clothing", product_type: "Trousers", collection: "Everyday Garden", material: "Cotton Twill", fit: "Relaxed", colors: [{ name: "Muted Peach", hex: "#EFA783" }, { name: "Light Sage", hex: "#BFC9A7" }], sizes: ["4Y", "6Y", "8Y", "10Y", "12Y"], description: "Pull-on cotton trousers built for climbing, sitting, and running.", details: ["Elastic drawstring waist", "Deep front pockets", "Reinforced knee seam"], care: ["Machine wash cold", "Line dry or tumble low", "Warm iron"], sku: "NABTA-TR-003", campaign: "/images/brands/nabta-kids/campaign.webp", featured: true }),
  product({ id: "nabta-sunstep-sneaker", name: "Sunstep Canvas Sneaker", brand_name: "NABTA KIDS", brand_slug: "nabta-kids", category: "kids", price: 1250, product_category: "Shoes", product_type: "Sneakers", collection: "Everyday Garden", material: "Cotton Canvas", fit: "Regular", colors: [{ name: "Pale Yellow", hex: "#EBCB69" }, { name: "Sky Blue", hex: "#9DC8E1" }], sizes: ["28", "29", "30", "31", "32", "33", "34", "35"], description: "A lightweight canvas sneaker with an easy hook-and-loop strap.", details: ["Flexible rubber sole", "Padded ankle", "Easy fastening"], care: ["Spot clean with mild soap", "Air dry", "Do not tumble dry"], sku: "NABTA-SN-004", campaign: "/images/brands/nabta-kids/campaign.webp", featured: true }),
  product({ id: "nabta-coral-daypack", name: "Coral Little Daypack", brand_name: "NABTA KIDS", brand_slug: "nabta-kids", category: "kids", price: 850, product_category: "Accessories", product_type: "Bags", collection: "Everyday Garden", material: "Cotton Canvas", fit: "One Size", colors: [{ name: "Soft Coral", hex: "#DF8068" }, { name: "Light Sage", hex: "#AEBB91" }], sizes: ["One Size"], description: "A child-sized canvas backpack for snacks, books, and small treasures.", details: ["Adjustable padded straps", "Easy-grip zip pulls", "Internal name label"], care: ["Spot clean", "Air dry", "Do not bleach"], sku: "NABTA-BG-005", campaign: "/images/brands/nabta-kids/campaign.webp", featured: true }),
  product({ id: "nabta-sage-chore-jacket", name: "Sage Chore Jacket", brand_name: "NABTA KIDS", brand_slug: "nabta-kids", category: "kids", price: 1350, compare_at_price: 1550, product_category: "Clothing", product_type: "Jackets", collection: "Little Explorer", material: "Cotton Canvas", fit: "Easy", colors: [{ name: "Light Sage", hex: "#B5BE98" }, { name: "Warm Cream", hex: "#EDE3D1" }], sizes: ["4Y", "6Y", "8Y", "10Y", "12Y"], description: "A light cotton jacket with big pockets for everyday discoveries.", details: ["Three patch pockets", "Soft enzyme wash", "Room for layering"], care: ["Machine wash cold", "Line dry", "Warm iron"], sku: "NABTA-JK-006", campaign: "/images/brands/nabta-kids/campaign.webp", featured: false }),
];

function stableUuid(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "5"; hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  const raw = hex.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function variantsFor(productRow) {
  return productRow.colors.flatMap((color, colorIndex) => productRow.sizes.map((size, sizeIndex) => ({
    id: stableUuid(`${productRow.id}|${color.name}|${size}`), product_id: productRow.id, color: color.name, size,
    sku: `${productRow.sku}-${colorIndex + 1}-${sizeIndex + 1}`, quantity: 8 + ((colorIndex + sizeIndex) % 5),
    low_stock_threshold: 3, price_override: null, availability_status: "available",
  })));
}

async function seed() {
  const products = [...MEN, ...KIDS];
  console.log(`Target: ${SEED_TARGET}. Upserting ${BRANDS.length} brands, ${products.length} products.`);
  const { error: brandError } = await supabase.from("brands").upsert(BRANDS, { onConflict: "slug" });
  if (brandError) throw brandError;
  const { error: productError } = await supabase.from("products").upsert(products, { onConflict: "id" });
  if (productError) throw productError;
  const variants = products.flatMap(variantsFor);
  const { error: variantError } = await supabase.from("product_variants").upsert(variants, { onConflict: "id" });
  if (variantError) throw variantError;
  console.log(`Seed complete: ${variants.length} deterministic variants. Re-running is safe.`);
}

seed().catch((error) => { console.error("Collection seed failed:", error.message); process.exit(1); });
