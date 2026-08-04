"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Baby,
  BadgeCheck,
  Grid2X2,
  Heart,
  Package,
  Shirt,
  ShoppingBag,
  Sparkles,
  Star,
  UserRound,
} from "lucide-react";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { isVariantPurchasable } from "@/lib/inventory/stockStatus";
import { getEffectivePrice } from "@/lib/pricing";
import type { Product } from "@/types";

type ProductKind = "clothing" | "accessories" | "shoes" | "bags";

function previewProduct(
  id: string,
  name: string,
  brand: string,
  price: number,
  image: string,
  audience: Product["audience"],
  productTypeName: string,
): Product {
  return {
    id,
    name,
    brand,
    brandSlug: brand.toLowerCase().replace(/\s+/g, "-"),
    price,
    currency: "EGP",
    image,
    audience,
    category: audience === "kids_baby" ? "kids" : audience === "women" ? "women" : "men",
    productTypeId: id,
    mainCategory: productTypeName === "Bag" ? "Accessories" : "Fashion",
    productGroup: productTypeName,
    productTypeName,
    rating: 4.8,
    reviewCount: 24,
    sizes: [],
    colors: [],
    inStock: true,
    variants: [],
    isNew: true,
  };
}

const PREVIEW_ARRIVALS: Product[] = [
  previewProduct("stone-overshirt", "Stone Linen Overshirt", "SAQR CAIRO", 1850, "/images/products/saqr-stone-overshirt/main.webp", "men", "Shirt"),
  previewProduct("charcoal-trouser", "Tailored Linen Pant", "SAQR CAIRO", 1650, "/images/products/saqr-charcoal-trouser/main.webp", "men", "Trousers"),
  previewProduct("field-bag", "Leather Crossbody Bag", "SAQR CAIRO", 2950, "/images/products/saqr-field-bag/main.webp", "unisex", "Bag"),
  previewProduct("leather-loafer", "Cairo Leather Loafer", "SAQR CAIRO", 2450, "/images/products/saqr-leather-loafer/main.webp", "men", "Shoes"),
  previewProduct("sand-blazer", "Sand Linen Blazer", "SAQR CAIRO", 2750, "/images/products/saqr-sand-linen-blazer/main.webp", "men", "Blazer"),
  previewProduct("navy-polo", "Navy Knit Polo", "SAQR CAIRO", 1320, "/images/products/saqr-navy-knit-polo/main.webp", "men", "Shirt"),
  previewProduct("cloud-cardigan", "Cloud Knit Cardigan", "NABTA", 1420, "/images/products/nabta-cloud-cardigan/main.webp", "women", "Cardigan"),
  previewProduct("coral-daypack", "Coral Daypack", "NABTA", 890, "/images/products/nabta-coral-daypack/main.webp", "kids_baby", "Bag"),
  previewProduct("sunstep-sneaker", "Sunstep Sneaker", "NABTA", 980, "/images/products/nabta-sunstep-sneaker/main.webp", "kids_baby", "Shoes"),
];

const FILTERS = [
  { id: "all", label: "All", icon: Grid2X2 },
  { id: "women", label: "Women", icon: UserRound },
  { id: "men", label: "Men", icon: UserRound },
  { id: "unisex", label: "Unisex", icon: Shirt },
  { id: "accessories", label: "Accessories", icon: Sparkles },
  { id: "shoes", label: "Shoes", icon: Package },
  { id: "bags", label: "Bags", icon: ShoppingBag },
  { id: "kids_baby", label: "Kids", icon: Baby },
] as const;

const SLOT_X = [
  "-50%",
  "calc(-50% + clamp(125px, 14vw, 180px))",
  "calc(-50% + clamp(250px, 28vw, 360px))",
  "calc(-50% + clamp(375px, 42vw, 540px))",
] as const;

function inferKind(product: Product): ProductKind {
  const taxonomy = `${product.mainCategory} ${product.productGroup} ${product.productTypeName}`.toLowerCase();
  if (taxonomy.includes("shoe") || taxonomy.includes("sneaker") || taxonomy.includes("loafer")) return "shoes";
  if (taxonomy.includes("bag") || taxonomy.includes("backpack")) return "bags";
  if (taxonomy.includes("accessor")) return "accessories";
  return "clothing";
}

function relativeSlot(index: number, activeIndex: number, length: number) {
  let distance = (index - activeIndex + length) % length;
  if (distance > length / 2) distance -= length;
  return distance;
}

function normalizeIndex(step: number, length: number) {
  return ((step % length) + length) % length;
}

function getPurchaseDetails(product: Product) {
  const variants = product.variants ?? [];
  const variant = variants.find((item) => isVariantPurchasable(item)) ?? variants[0];
  return {
    variant,
    price: getEffectivePrice(variant?.variantPrice ?? product.price, product.discountPercent, product.discountEndsAt),
    size: variant?.optionValues.find((option) => option.optionTypeName === "Size")?.label ?? product.sizes[0] ?? "",
    color: variant?.optionValues.find((option) => option.optionTypeName === "Color")?.label,
  };
}

function TheaterProductCard({ product, slot }: { product: Product; slot: number }) {
  const distance = Math.min(Math.abs(slot), 3);
  const direction = slot < 0 ? -1 : 1;
  const scales = [1, 0.84, 0.84, 0.84];
  const y = [-18, 12, 12, 12];
  const opacity = [1, 0.92, 0.76, 0.5];
  const blur = [0, 0.2, 0.8, 1.8];
  const depthFilter = distance === 0
    ? "blur(0px) drop-shadow(0 12px 24px rgba(193,128,13,.45)) drop-shadow(0 0 20px rgba(224,170,49,.58))"
    : `blur(${blur[distance]}px)`;
  const x = distance === 0
    ? SLOT_X[0]
    : direction < 0
      ? SLOT_X[distance].replace(" + ", " - ")
      : SLOT_X[distance];

  return (
    <motion.article
      initial={false}
      animate={{ x, y: y[distance], scale: scales[distance], rotateY: distance === 0 ? 0 : direction * -2.5, opacity: Math.abs(slot) > 3 ? 0 : opacity[distance] }}
      transition={{ type: "spring", stiffness: 155, damping: 24, mass: 0.82 }}
      style={{ zIndex: 40 - distance * 6, filter: depthFilter, transformPerspective: 1100 }}
      className="absolute bottom-[166px] left-1/2 h-[clamp(245px,24vw,370px)] w-[clamp(150px,15.2vw,232px)] origin-bottom cursor-grab touch-pan-y select-none overflow-hidden rounded-[clamp(16px,1.5vw,24px)] border border-white/90 bg-[linear-gradient(145deg,rgba(255,255,255,.96),rgba(248,240,233,.91))] shadow-[0_28px_55px_rgba(78,49,31,.16),inset_0_1px_0_white] backdrop-blur-sm active:cursor-grabbing"
      aria-hidden={Math.abs(slot) > 2}
    >
      <Link href={`/product/${product.id}`} tabIndex={Math.abs(slot) > 2 ? -1 : 0} aria-label={`View ${product.name}`} className="absolute inset-0 z-20" draggable={false} />
      {product.isNew ? (
        <span className="absolute left-[8%] top-[5%] z-10 rounded-full bg-white/90 px-2.5 py-1 text-[clamp(8px,.7vw,11px)] font-extrabold uppercase tracking-[0.05em] text-[#d20d10] shadow-[0_4px_14px_rgba(86,40,25,.08)]">New</span>
      ) : null}
      <div className="relative h-[82%] w-full px-[6%] pb-2 pt-[14%]">
        <Image src={product.image} alt="" fill sizes="(max-width: 768px) 170px, 235px" className="pointer-events-none object-contain p-[7%] drop-shadow-[0_18px_18px_rgba(52,31,18,.18)]" draggable={false} />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex h-[18%] items-center justify-center border-t border-[#8d6849]/10 bg-white/68 px-3 backdrop-blur-md">
        <h3 className="line-clamp-2 text-center text-[clamp(10px,.85vw,14px)] font-semibold leading-tight text-[#171310]">{product.name}</h3>
      </div>
      {distance === 0 ? <span className="pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-inset ring-white/75" /> : null}
    </motion.article>
  );
}

function ProductTheater({ products }: { products: Product[] }) {
  const reduceMotion = useReducedMotion();
  const { addItem } = useCart();
  const { toggleItem, isWishlisted } = useWishlist();
  const [activeStep, setActiveStep] = useState(() => Math.min(2, products.length - 1));
  const [interactionVersion, setInteractionVersion] = useState(0);
  const activeIndex = normalizeIndex(activeStep, products.length);
  const activeProduct = products[activeIndex];
  const purchase = getPurchaseDetails(activeProduct);
  const wishlisted = isWishlisted(activeProduct.id);

  const move = (direction: number) => {
    setActiveStep((current) => current + direction);
    setInteractionVersion((current) => current + 1);
  };

  const selectProduct = (index: number) => {
    setActiveStep((current) => {
      const currentIndex = normalizeIndex(current, products.length);
      let distance = index - currentIndex;
      if (distance > products.length / 2) distance -= products.length;
      if (distance < -products.length / 2) distance += products.length;
      return current + distance;
    });
    setInteractionVersion((current) => current + 1);
  };

  useEffect(() => {
    if (reduceMotion || products.length < 2) return;
    const timer = window.setInterval(() => setActiveStep((current) => current + 1), 4600);
    return () => window.clearInterval(timer);
  }, [interactionVersion, products.length, reduceMotion]);

  const addActiveProduct = () => {
    addItem({
      productId: activeProduct.id,
      variantId: purchase.variant?.id,
      name: activeProduct.name,
      brand: activeProduct.brand,
      brandSlug: activeProduct.brandSlug ?? "",
      price: purchase.price,
      currency: activeProduct.currency,
      image: activeProduct.image,
      size: purchase.size,
      color: purchase.color,
      quantity: 1,
      availableSizes: activeProduct.sizes,
      availableColors: activeProduct.colors.map((item) => item.name),
    });
  };

  const toggleActiveWishlist = () => {
    toggleItem({
      productId: activeProduct.id,
      name: activeProduct.name,
      brand: activeProduct.brand,
      brandSlug: activeProduct.brandSlug,
      price: purchase.price,
      currency: activeProduct.currency,
      image: activeProduct.image,
    });
  };

  return (
    <div className="relative min-h-[480px] overflow-hidden sm:min-h-[555px] lg:min-h-[610px]" style={{ perspective: "1200px" }}>
      <div className="pointer-events-none absolute left-1/2 top-[6%] h-[64%] w-[72%] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(255,255,255,.95)_0%,rgba(255,244,236,.62)_44%,transparent_72%)] blur-2xl" />
      <div className="pointer-events-none absolute bottom-[142px] left-1/2 z-[16] h-[clamp(310px,32vw,430px)] w-[clamp(220px,25vw,340px)] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(231,177,44,.58)_0%,rgba(218,158,25,.3)_38%,rgba(193,132,20,.1)_60%,transparent_76%)] blur-[12px]" aria-hidden />

      <motion.div
        className="absolute inset-0 z-20 touch-pan-y"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.18}
        dragMomentum
        onDragEnd={(_, info) => {
          const force = info.offset.x + info.velocity.x * 0.16;
          if (Math.abs(force) > 42) {
            const steps = Math.min(3, Math.max(1, Math.round(Math.abs(force) / 150)));
            move((force < 0 ? 1 : -1) * steps);
          }
        }}
      >
        {products.map((product, index) => (
          <TheaterProductCard key={product.id} product={product} slot={relativeSlot(index, activeIndex, products.length)} />
        ))}
      </motion.div>

      <button type="button" onClick={() => move(-1)} aria-label="Previous product" className="absolute left-2 top-[46%] z-50 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/90 bg-white/88 text-mahalyred shadow-[0_10px_30px_rgba(71,43,27,.11)] backdrop-blur transition hover:-translate-x-1 hover:bg-white sm:left-5">
        <ArrowLeft className="h-5 w-5" strokeWidth={2} />
      </button>
      <button type="button" onClick={() => move(1)} aria-label="Next product" className="absolute right-2 top-[46%] z-50 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/90 bg-white/88 text-mahalyred shadow-[0_10px_30px_rgba(71,43,27,.11)] backdrop-blur transition hover:translate-x-1 hover:bg-white sm:right-5">
        <ArrowRight className="h-5 w-5" strokeWidth={2} />
      </button>

      <div className="pointer-events-none absolute inset-0 z-40">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`brand-${activeProduct.id}`} initial={{ opacity: 0, x: "-50%", y: 6, scale: 0.97 }} animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }} exit={{ opacity: 0, x: "-50%", y: -5, scale: 0.97 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} style={{ left: "calc(50% - clamp(125px, 14vw, 180px))" }} className="absolute bottom-[82px] flex h-[52px] w-[clamp(100px,11vw,150px)] items-center justify-center gap-1.5 text-center text-[9px] font-bold sm:text-[12px] lg:text-[13px]">
            <span className="max-w-[150px] truncate">{activeProduct.brand}</span>
            <BadgeCheck className="h-4 w-4 shrink-0 fill-[#f4ae08] text-white" strokeWidth={2.2} />
          </motion.div>
        </AnimatePresence>
        <button type="button" onClick={addActiveProduct} disabled={!activeProduct.inStock} aria-label={`Add ${activeProduct.name} to cart for ${formatPrice(purchase.price, activeProduct.currency)}`} className="pointer-events-auto absolute bottom-[88px] left-1/2 flex h-10 min-w-[118px] -translate-x-1/2 items-center justify-center gap-2 rounded-full bg-[linear-gradient(180deg,#df1719,#c50008)] px-4 text-[11px] font-bold text-white shadow-[0_9px_18px_rgba(184,0,8,.2),inset_0_1px_0_rgba(255,255,255,.28)] transition hover:scale-[1.025] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45 sm:h-[46px] sm:min-w-[160px] sm:text-[14px]">
          <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.8} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={`price-${activeProduct.id}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>{formatPrice(purchase.price, activeProduct.currency)}</motion.span>
          </AnimatePresence>
        </button>
        <AnimatePresence mode="wait" initial={false}>
          <motion.button key={`wishlist-${activeProduct.id}`} type="button" onClick={toggleActiveWishlist} aria-label={wishlisted ? `Remove ${activeProduct.name} from wishlist` : `Add ${activeProduct.name} to wishlist`} initial={{ opacity: 0, x: "-50%", y: 6, scale: 0.86 }} animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }} exit={{ opacity: 0, x: "-50%", y: -5, scale: 0.86 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} style={{ left: "calc(50% + clamp(125px, 14vw, 180px))" }} className="pointer-events-auto absolute bottom-[89px] flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:text-mahalyred">
            <Heart className="h-6 w-6 sm:h-7 sm:w-7" fill={wishlisted ? "currentColor" : "none"} strokeWidth={1.5} />
          </motion.button>
        </AnimatePresence>
      </div>

      <div className="absolute bottom-[68px] left-1/2 z-40 flex -translate-x-1/2 gap-2" role="group" aria-label="Choose featured product">
        {products.map((product, index) => (
          <button key={product.id} type="button" onClick={() => selectProduct(index)} aria-label={`Show ${product.name}`} aria-current={index === activeIndex ? "true" : undefined} className={`h-1.5 rounded-full shadow-[0_1px_2px_rgba(74,45,29,.12)] transition-all duration-300 ${index === activeIndex ? "w-5 bg-mahalyred" : "w-3 bg-[#b8aaa0] hover:bg-[#93847a]"}`} />
        ))}
      </div>
    </div>
  );
}

function ExploreProductCard({ product }: { product: Product }) {
  const { toggleItem, isWishlisted } = useWishlist();
  const wishlisted = isWishlisted(product.id);
  const purchase = getPurchaseDetails(product);
  const roundedRating = Math.round(product.rating ?? 0);

  const toggleWishlist = () => {
    toggleItem({ productId: product.id, name: product.name, brand: product.brand, brandSlug: product.brandSlug, price: purchase.price, currency: product.currency, image: product.image });
  };

  return (
    <article data-explore-card={product.id} className="group relative overflow-hidden rounded-[18px] bg-[#eadfce] shadow-[0_10px_28px_rgba(24,19,14,0.1)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_22px_50px_rgba(24,19,14,0.2)] focus-within:-translate-y-1 focus-within:shadow-[0_22px_50px_rgba(24,19,14,0.2)]">
      <Link href={`/product/${product.id}`} aria-label={`View ${product.name}`} className="absolute inset-0 z-10" />
      <div className="relative aspect-[0.78] overflow-hidden rounded-[inherit]">
        <Image src={product.image} alt={product.name} fill sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 17vw" className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.055] group-focus-within:scale-[1.055]" />
        <div className="absolute inset-x-0 bottom-0 z-[1] h-1/4 bg-gradient-to-t from-black/35 to-transparent" />
        <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/90 via-black/25 to-transparent opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100 group-focus-within:opacity-100" />
        <button type="button" onClick={toggleWishlist} aria-label={wishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`} className="absolute right-3 top-3 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-ink shadow-[0_3px_10px_rgba(0,0,0,0.12)] backdrop-blur transition hover:scale-105 hover:text-mahalyred">
          <Heart className="h-4 w-4" fill={wishlisted ? "currentColor" : "none"} strokeWidth={1.6} />
        </button>
        <div data-card-details className="pointer-events-none absolute inset-x-0 bottom-0 z-20 translate-y-5 p-4 pb-[58px] text-white opacity-0 transition-[opacity,transform] duration-500 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 sm:p-[18px] sm:pb-[60px]">
          <p className="truncate text-[9px] font-bold uppercase tracking-[0.15em] text-white/70">{product.brand}</p>
          <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-[1.12] tracking-[-0.02em] sm:text-[18px]">{product.name}</h3>
          <div className="mt-2 flex items-center gap-0.5 text-white/80" aria-label={`${product.rating ?? 0} out of 5 stars, ${product.reviewCount ?? 0} reviews`}>
            {Array.from({ length: 5 }, (_, index) => (
              <Star key={index} className="h-2.5 w-2.5" fill={index < roundedRating ? "currentColor" : "none"} strokeWidth={1.8} />
            ))}
            <span className="ml-1 text-[9px] font-medium text-white/55">({product.reviewCount ?? 0})</span>
          </div>
        </div>
        <p className="pointer-events-none absolute bottom-4 left-4 z-20 w-fit rounded-full border border-white/30 bg-black/55 px-3 py-1.5 text-[11px] font-bold leading-none text-white shadow-sm backdrop-blur-sm sm:bottom-[18px] sm:left-[18px]">{formatPrice(purchase.price, product.currency)}</p>
      </div>
    </article>
  );
}

export default function NewArrivalsExperience({ products }: { products: Product[] }) {
  const [activeFilter, setActiveFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [sort, setSort] = useState("newest");
  const arrivals = useMemo(() => products.length ? products : PREVIEW_ARRIVALS, [products]);
  const theaterProducts = useMemo(() => arrivals.slice(0, 9), [arrivals]);
  const visibleArrivals = useMemo(() => {
    const filtered = arrivals.filter((item) => {
      if (activeFilter === "all") return true;
      const kind = inferKind(item);
      if (activeFilter === "accessories") return kind === "accessories" || kind === "bags";
      if (activeFilter === "shoes" || activeFilter === "bags") return kind === activeFilter;
      return item.audience === activeFilter;
    });
    if (sort === "price-low") return [...filtered].sort((a, b) => a.price - b.price);
    if (sort === "price-high") return [...filtered].sort((a, b) => b.price - a.price);
    return filtered;
  }, [activeFilter, arrivals, sort]);

  return (
    <div className="bg-[#f7f3ee] text-ink">
      <section className="relative overflow-hidden border-b border-[#eadfd7] bg-[radial-gradient(circle_at_50%_30%,#fffdfb_0%,#f8efea_43%,#f3e9e3_100%)]" aria-labelledby="new-arrivals-title">
        <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(115deg,transparent_15%,rgba(255,255,255,.8)_48%,transparent_76%)]" />
        <div className="relative mx-auto max-w-[1600px]">
          <div className="relative z-30 flex flex-col items-center px-7 pb-1 pt-11 text-center sm:px-12 sm:pt-12 lg:pt-14">
            <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#cf1014] sm:text-[11px]">New on Mahaly</motion.p>
            <motion.h1 id="new-arrivals-title" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.06, ease: [0.22, 1, 0.36, 1] }} className="font-serif text-[39px] font-semibold leading-[1.06] tracking-[-0.04em] text-[#12100f] sm:text-[48px] lg:text-[54px]">Just landed, locally made.</motion.h1>
            <p className="mt-3 max-w-[660px] text-[13px] leading-6 text-[#5f5a56] sm:text-[14px]">Fresh drops from Egypt&apos;s most exciting independent brands — updated every week.</p>
            <Link href="#more-to-explore" className="group mt-3 inline-flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[#cc1115]">The everyday edit <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" strokeWidth={1.8} /></Link>
          </div>
          <div className="mx-auto w-full max-w-[1500px]">
            <ProductTheater products={theaterProducts} />
          </div>
        </div>
      </section>

      <section id="more-to-explore" className="relative mx-auto max-w-[1500px] scroll-mt-24 px-5 pb-20 pt-10 sm:px-8 lg:px-12">
        <div className="relative z-20 rounded-[16px] border border-black/5 bg-white/90 px-3 shadow-[0_14px_45px_rgba(44,31,22,.10)] backdrop-blur-xl sm:px-5">
          <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
            {FILTERS.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setActiveFilter(id)} className={`relative flex min-w-[116px] flex-1 items-center justify-center gap-2.5 px-4 py-4 text-[11px] font-medium transition-colors ${activeFilter === id ? "text-mahalyred" : "text-ink-soft hover:text-ink"}`}><Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />{label}{activeFilter === id ? <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-mahalyred" /> : null}</button>)}
          </div>
        </div>
        <div className="mb-5 mt-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-mahalyred">Fresh this week</p><h2 className="mt-1 font-serif text-[32px] font-semibold tracking-[-0.03em]">More to explore</h2></div>
          <div className="flex items-center gap-2.5 text-[11px]"><label className="sr-only" htmlFor="new-arrivals-sort">Sort new arrivals</label><select id="new-arrivals-sort" value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-full border border-black/10 bg-white px-4 py-2 outline-none transition focus:border-mahalyred/50"><option value="newest">Newest first</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select><span className="rounded-full border border-black/10 bg-white px-4 py-2">This week</span><span className="ml-2 whitespace-nowrap text-ink-soft/60">{visibleArrivals.length} items</span></div>
        </div>
        {visibleArrivals.length ? (
          <motion.div layout className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
            <AnimatePresence mode="popLayout">
              {visibleArrivals.map((item, index) => <motion.div key={item.id} layout initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.38, delay: Math.min(index, 5) * 0.04 }}><ExploreProductCard product={item} /></motion.div>)}
            </AnimatePresence>
          </motion.div>
        ) : <div className="rounded-[18px] border border-dashed border-black/10 bg-white/55 py-16 text-center"><p className="font-serif text-2xl">More local drops are on the way.</p><button type="button" onClick={() => setActiveFilter("all")} className="mt-4 text-sm font-semibold text-mahalyred">View all arrivals</button></div>}
      </section>
    </div>
  );
}
