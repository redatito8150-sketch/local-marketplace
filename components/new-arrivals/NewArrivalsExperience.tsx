"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Heart,
  ShoppingBag,
} from "lucide-react";
import CatalogControls, { CatalogEmptyState } from "@/components/category/CatalogControls";
import CompactProductCard from "@/components/shared/CompactProductCard";
import { formatPrice } from "@/lib/format";
import { useWishlist } from "@/context/WishlistContext";
import { isVariantPurchasable } from "@/lib/inventory/stockStatus";
import { getVariantEffectivePrice } from "@/lib/pricing";
import { buildDynamicFilterGroups } from "@/lib/filters";
import { useProductFilters } from "@/lib/hooks/useProductFilters";
import { NEW_ARRIVAL_WINDOW_DAYS } from "@/lib/newArrivals";
import { DEFAULT_THEATER_GRADIENT, theaterGlowFromHex, theaterGradientFromHex } from "@/lib/color/theaterGradient";
import type { Product } from "@/types";

const SLOT_X = [
  "-50%",
  "calc(-50% + clamp(125px, 14vw, 180px))",
  "calc(-50% + clamp(250px, 28vw, 360px))",
  "calc(-50% + clamp(375px, 42vw, 540px))",
] as const;

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
  const basePrice = variant?.variantPrice ?? product.price;
  const pricing = getVariantEffectivePrice(
    product.price,
    variant?.variantPrice,
    product.discountPercent,
    product.discountEndsAt,
    variant?.variantDiscountPercent
  );
  return {
    basePrice,
    price: pricing.price,
    discountActive: pricing.active,
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
    ? "blur(0px) drop-shadow(0 18px 28px rgba(66,48,39,.18)) drop-shadow(0 0 18px rgba(200,89,86,.16))"
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
      <div className="relative h-[82%] w-full pb-1">
        <Image src={product.image} alt="" fill sizes="(max-width: 768px) 170px, 235px" className="pointer-events-none object-contain p-[4%] drop-shadow-[0_18px_18px_rgba(52,31,18,.18)]" draggable={false} />
        {product.isNew ? (
          <span className="absolute left-[8%] top-[5%] z-10 rounded-full bg-white/90 px-2.5 py-1 text-[clamp(8px,.7vw,11px)] font-extrabold uppercase tracking-[0.05em] text-[#d20d10] shadow-[0_4px_14px_rgba(86,40,25,.08)]">New</span>
        ) : null}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex h-[18%] items-center justify-center border-t border-[#8d6849]/10 bg-white/68 px-3 backdrop-blur-md">
        <h3 className="line-clamp-2 text-center text-[clamp(10px,.85vw,14px)] font-semibold leading-tight text-[#171310]">{product.name}</h3>
      </div>
      {distance === 0 ? <span className="pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-inset ring-white/75" /> : null}
    </motion.article>
  );
}

function ProductTheater({ products, onActiveColorChange }: { products: Product[]; onActiveColorChange?: (hex: string | undefined) => void }) {
  const reduceMotion = useReducedMotion();
  const { toggleItem, isWishlisted } = useWishlist();
  const [activeStep, setActiveStep] = useState(() => Math.min(2, products.length - 1));
  const [interactionVersion, setInteractionVersion] = useState(0);
  const activeIndex = normalizeIndex(activeStep, products.length);
  const activeProduct = products[activeIndex];
  const purchase = getPurchaseDetails(activeProduct);
  const wishlisted = isWishlisted(activeProduct.id);

  useEffect(() => {
    onActiveColorChange?.(activeProduct.colors[0]?.hex);
  }, [activeProduct, onActiveColorChange]);

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
    <div className="relative min-h-[465px] overflow-hidden sm:min-h-[520px] lg:min-h-[550px]" style={{ perspective: "1200px" }}>
      <div className="pointer-events-none absolute left-1/2 top-[6%] h-[64%] w-[72%] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(255,255,255,.95)_0%,rgba(255,244,236,.62)_44%,transparent_72%)] blur-2xl" />
      <motion.div
        animate={{ background: theaterGlowFromHex(activeProduct.colors[0]?.hex) }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none absolute bottom-[142px] left-1/2 z-[16] h-[clamp(310px,32vw,430px)] w-[clamp(220px,25vw,340px)] -translate-x-1/2 rounded-[50%] blur-[12px]"
        aria-hidden
      />

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
            <BadgeCheck className="h-4 w-4 shrink-0 fill-[#C85956] text-white" strokeWidth={2.2} />
          </motion.div>
        </AnimatePresence>
        <Link href={`/product/${activeProduct.id}`} aria-label={`View ${activeProduct.name} for ${formatPrice(purchase.price, activeProduct.currency)}`} className="pointer-events-auto absolute bottom-[88px] left-1/2 flex h-10 min-w-[148px] -translate-x-1/2 items-center justify-center gap-2 rounded-full bg-[#C85956] px-4 text-[10.5px] font-bold text-white shadow-[0_9px_18px_rgba(162,66,64,.24),inset_0_1px_0_rgba(255,255,255,.22)] transition hover:scale-[1.025] hover:bg-[#b94f4c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#C85956] sm:h-[46px] sm:min-w-[190px] sm:text-[12.5px]">
          <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.8} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={`price-${activeProduct.id}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>{activeProduct.inStock ? "View product" : "View details"} · {formatPrice(purchase.price, activeProduct.currency)}</motion.span>
          </AnimatePresence>
        </Link>
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

export default function NewArrivalsExperience({ products }: { products: Product[] }) {
  const [heroGradient, setHeroGradient] = useState(DEFAULT_THEATER_GRADIENT);
  const handleActiveColorChange = useCallback((hex: string | undefined) => {
    setHeroGradient(theaterGradientFromHex(hex));
  }, []);
  const arrivals = products;
  const theaterProducts = useMemo(() => arrivals.slice(0, 7), [arrivals]);
  const filterGroups = useMemo(() => buildDynamicFilterGroups(arrivals), [arrivals]);
  const productTypeRelations = useMemo(
    () => arrivals.map((product) => ({ mainCategory: product.mainCategory, productType: product.productTypeName })),
    [arrivals]
  );
  const {
    selected,
    sort,
    setSort,
    toggleFilter,
    clearFilters,
    sortedProducts: visibleArrivals,
    priceBounds,
    setPriceRange,
  } = useProductFilters(arrivals);

  if (!arrivals.length) {
    return (
      <section className="relative grid min-h-[68vh] place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_28%,#fffdfb_0%,#f7eee8_48%,#eee1d8_100%)] px-6 py-20 text-center">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/55 blur-3xl" />
        <div className="relative max-w-lg">
          <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#C85956]">New on Zakhnook</p>
          <h1 className="mt-4 font-serif text-[42px] font-semibold leading-[1.05] tracking-[-.04em] text-[#242424] sm:text-[54px]">The next drop is taking shape.</h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#6f655f]">There are no products inside the new-arrival window today. Explore the full marketplace while our brands prepare what is next.</p>
          <Link href="/shop/all" className="mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-[#C85956] px-6 text-xs font-bold text-white transition hover:bg-[#b94f4c] active:scale-[.98]">Explore all products <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    );
  }

  return (
    <div className="bg-[#f7f3ee] text-ink">
      <motion.section
        animate={{ background: heroGradient }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden"
        aria-labelledby="new-arrivals-title"
      >
        <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(115deg,transparent_15%,rgba(255,255,255,.8)_48%,transparent_76%)]" />
        {/* Blends the section's shifting gradient into the page's base cream
            instead of cutting off at a hard edge above the filter bar. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32 bg-gradient-to-b from-transparent to-[#f7f3ee]" />
        <div className="relative mx-auto max-w-[1600px]">
          <div className="relative z-30 flex flex-col items-center px-7 pb-1 pt-11 text-center sm:px-12 sm:pt-12 lg:pt-14">
            <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#cf1014] sm:text-[11px]">New on Zakhnook</motion.p>
            <motion.h1 id="new-arrivals-title" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.06, ease: [0.22, 1, 0.36, 1] }} className="font-serif text-[39px] font-semibold leading-[1.06] tracking-[-0.04em] text-[#12100f] sm:text-[48px] lg:text-[54px]">Just landed, locally made.</motion.h1>
            <p className="mt-3 max-w-[660px] text-[13px] leading-6 text-[#5f5a56] sm:text-[14px]">The latest pieces from Egypt&apos;s independent brands, collected as soon as they arrive.</p>
          </div>
          <div className="mx-auto mt-6 w-full max-w-[1500px]">
            {theaterProducts.length ? (
              <ProductTheater products={theaterProducts} onActiveColorChange={handleActiveColorChange} />
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 px-6 py-16 text-center sm:min-h-[420px]">
                <p className="font-serif text-2xl text-[#12100f]">New drops are on the way.</p>
                <p className="max-w-sm text-[13px] text-[#5f5a56]">Check back soon — this space will feature the newest pieces from Zakhnook&apos;s independent brands.</p>
              </div>
            )}
          </div>
        </div>
      </motion.section>

      <section id="more-to-explore" className="relative mx-auto max-w-[1440px] scroll-mt-24 px-5 pb-20 pt-10 sm:px-8 lg:px-12">
        <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C85956]">Latest {NEW_ARRIVAL_WINDOW_DAYS} days</p><h2 className="mt-1 font-serif text-[32px] font-semibold tracking-[-0.03em]">All new arrivals</h2></div>
          <p className="text-[11px] tabular-nums text-ink-soft/60">{visibleArrivals.length} {visibleArrivals.length === 1 ? "item" : "items"}</p>
        </div>
        <CatalogControls
          groups={filterGroups}
          products={arrivals}
          productTypeRelations={productTypeRelations}
          selected={selected}
          onToggle={toggleFilter}
          onClear={clearFilters}
          productCount={visibleArrivals.length}
          viewMode="grid"
          onViewModeChange={() => undefined}
          sort={sort}
          onSortChange={setSort}
          priceBounds={priceBounds}
          onPriceChange={setPriceRange}
        />
        {visibleArrivals.length ? (
          <motion.div layout className="mt-6 grid grid-cols-1 gap-5 min-[460px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
            <AnimatePresence mode="popLayout">
              {visibleArrivals.map((item, index) => <motion.div key={item.id} layout initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.38, delay: Math.min(index, 5) * 0.04 }}><CompactProductCard product={item} /></motion.div>)}
            </AnimatePresence>
          </motion.div>
        ) : <CatalogEmptyState onClear={clearFilters} />}
      </section>
    </div>
  );
}
