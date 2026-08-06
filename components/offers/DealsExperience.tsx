"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Baby, Clock3, Grid2X2, Package, Shirt, ShoppingBag, Sparkles, Tag, UserRound } from "lucide-react";
import CompactProductCard from "@/components/shared/CompactProductCard";
import { formatPrice } from "@/lib/format";
import { getEffectivePrice } from "@/lib/pricing";
import type { Product } from "@/types";

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

type DealFilter = (typeof FILTERS)[number]["id"];
type DealSort = "ending-soon" | "discount-high" | "price-low" | "price-high";

const HERO_CAMPAIGN_IMAGES: Record<string, string> = {
  "stone-overshirt": "/images/offers/hero/stone-overshirt-lifestyle.png",
  "navy-polo": "/images/offers/hero/navy-polo-lifestyle.png",
  "sand-blazer": "/images/offers/hero/sand-blazer-lifestyle.png",
};

// The panels are skewed, so their visible centers near the cards differ from
// the centers of the underlying equal-width grid columns.
const HERO_CARD_ALIGNMENTS = ["lg:left-1/2", "lg:left-[41%]", "lg:left-[43%]"] as const;

function inferKind(product: Product) {
  const taxonomy = `${product.mainCategory} ${product.productGroup} ${product.productTypeName}`.toLowerCase();
  if (taxonomy.includes("shoe") || taxonomy.includes("sneaker") || taxonomy.includes("loafer")) return "shoes";
  if (taxonomy.includes("bag") || taxonomy.includes("backpack")) return "bags";
  if (taxonomy.includes("accessor")) return "accessories";
  return "clothing";
}

function dealPrice(product: Product) {
  return getEffectivePrice(product.price, product.discountPercent, product.discountEndsAt);
}

function endingTime(product: Product) {
  if (!product.discountEndsAt) return Number.POSITIVE_INFINITY;
  const value = new Date(product.discountEndsAt).getTime();
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

function countdownParts(endAt: string | undefined, now: number | null) {
  if (!endAt || now === null) return { days: "--", hours: "--", minutes: "--" };
  const remaining = Math.max(0, new Date(endAt).getTime() - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return { days: String(days).padStart(2, "0"), hours: String(hours).padStart(2, "0"), minutes: String(minutes).padStart(2, "0") };
}

function HeroBackdrop({ product, index, isFirst, isLast }: { product: Product; index: number; isFirst: boolean; isLast: boolean }) {
  const campaignImage = HERO_CAMPAIGN_IMAGES[product.id] ?? product.image;
  const leadingEdge = isFirst ? "38%" : "26%";
  const trailingEdge = isLast ? "100%" : "82%";
  const clipPath = `polygon(${leadingEdge} 0, 100% 0, ${trailingEdge} 100%, 0 100%)`;

  return (
    <div className="relative overflow-visible" style={{ zIndex: index + 1 }}>
      <div className="absolute -inset-x-[30%] inset-y-0 overflow-hidden [filter:drop-shadow(-3px_0_0_white)]" style={{ clipPath }}>
        {isFirst ? (
          <>
            <Image src={campaignImage} alt="" fill sizes="22vw" priority className="scale-105 object-cover object-center opacity-55 blur-xl" />
            <Image src={campaignImage} alt="" fill sizes="22vw" priority className="object-contain object-center" />
          </>
        ) : (
          <Image src={campaignImage} alt="" fill sizes="22vw" className="object-cover object-center" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/5" />
      </div>
    </div>
  );
}

function HeroDeal({ product, index }: { product: Product; index: number }) {
  const currentPrice = dealPrice(product);
  const campaignImage = HERO_CAMPAIGN_IMAGES[product.id] ?? product.image;
  return (
    <motion.article initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.65, delay: 0.12 + index * 0.08 }} className="group relative min-h-[330px] shrink-0 overflow-hidden bg-[#d9c7b4] lg:min-h-0 lg:overflow-visible lg:bg-transparent">
      <Link href={`/product/${product.id}`} aria-label={`View expiring deal for ${product.name}`} className="absolute inset-0 z-20" />
      <div className="absolute inset-0 overflow-hidden lg:hidden">
        <Image src={campaignImage} alt={`${product.name} campaign`} fill sizes="(max-width: 1024px) 72vw, 22vw" priority={index === 0} className="object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.035]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/5" />
      </div>
      <div className={`absolute bottom-5 left-1/2 z-10 flex w-[82%] max-w-[260px] -translate-x-1/2 items-center gap-3 rounded-[14px] border border-white/40 bg-black/55 p-2 text-white shadow-[0_14px_38px_rgba(25,14,10,.32)] backdrop-blur-md sm:bottom-6 ${HERO_CARD_ALIGNMENTS[index]}`}>
        <div className="relative h-[62px] w-[62px] shrink-0 overflow-hidden rounded-[10px] bg-[#f5eee7]"><Image src={product.image} alt={product.name} fill sizes="62px" className="object-cover" /></div>
        <div className="min-w-0">
          <p className="truncate text-[8px] font-bold uppercase tracking-[0.12em] text-white/70">{product.brand}</p>
          <h3 className="mt-0.5 truncate text-[12px] font-semibold sm:text-[13px]">{product.name}</h3>
          <p className="mt-1 text-[9px] text-white/60">Was <span className="line-through">{formatPrice(product.price, product.currency)}</span></p>
          <p className="mt-0.5 text-[11px] font-bold text-white">Now {formatPrice(currentPrice, product.currency)}</p>
        </div>
      </div>
    </motion.article>
  );
}

function BudgetPanel({ limit, products, active, onSelect }: { limit: number; products: Product[]; active: boolean; onSelect: () => void }) {
  const picks = products.filter((item) => dealPrice(item) <= limit).slice(0, 2);
  return (
    <a href="#deal-products" onClick={onSelect} className={`group grid min-h-[116px] grid-cols-[auto_1fr_auto] items-center gap-4 rounded-[18px] border p-4 transition duration-300 sm:p-5 lg:grid-cols-[auto_1fr_minmax(220px,0.9fr)_auto] ${active ? "border-mahalyred bg-[#fff6f1] shadow-[0_15px_38px_rgba(176,28,23,.12)]" : "border-black/7 bg-white/70 hover:border-mahalyred/30 hover:bg-white hover:shadow-[0_15px_38px_rgba(44,31,22,.10)]"}`}>
      <Tag className={`h-10 w-10 rotate-[-8deg] ${active ? "text-mahalyred" : "text-[#b96f20]"}`} strokeWidth={1.35} />
      <div><p className="font-serif text-[23px] font-semibold tracking-[-0.025em]">Under EGP {limit.toLocaleString("en-US")}</p><p className="mt-1 text-[11px] text-ink-soft/65">Great local finds, easy on your budget.</p></div>
      <div className="hidden grid-cols-2 gap-2 lg:grid">
        {picks.map((item) => <div key={item.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-[#f4eee8] p-2"><div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg"><Image src={item.image} alt="" fill sizes="48px" className="object-cover" /></div><div className="min-w-0"><p className="truncate text-[10px] font-semibold">{item.name}</p><p className="mt-1 text-[10px] font-bold">{formatPrice(dealPrice(item), item.currency)}</p></div></div>)}
      </div>
      <ArrowRight className="h-5 w-5 text-mahalyred transition-transform group-hover:translate-x-1" strokeWidth={1.7} />
    </a>
  );
}

export default function DealsExperience({ products }: { products: Product[] }) {
  const [activeFilter, setActiveFilter] = useState<DealFilter>("all");
  const [sort, setSort] = useState<DealSort>("ending-soon");
  const [budgetMax, setBudgetMax] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  const endingSoon = useMemo(() => [...products].sort((a, b) => endingTime(a) - endingTime(b)), [products]);
  const heroProducts = endingSoon.slice(0, 3);
  const countdown = countdownParts(heroProducts[0]?.discountEndsAt, now);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleProducts = useMemo(() => {
    const filtered = products.filter((item) => {
      const matchesAudience = activeFilter === "all"
        || (activeFilter === "accessories" ? ["accessories", "bags"].includes(inferKind(item)) : activeFilter === "shoes" || activeFilter === "bags" ? inferKind(item) === activeFilter : item.audience === activeFilter);
      return matchesAudience && (budgetMax === null || dealPrice(item) <= budgetMax);
    });
    return [...filtered].sort((a, b) => {
      if (sort === "discount-high") return (b.discountPercent ?? 0) - (a.discountPercent ?? 0);
      if (sort === "price-low") return dealPrice(a) - dealPrice(b);
      if (sort === "price-high") return dealPrice(b) - dealPrice(a);
      return endingTime(a) - endingTime(b);
    });
  }, [activeFilter, budgetMax, products, sort]);

  return (
    <div className="bg-[#f7f3ee] text-ink">
      <section className="relative grid min-h-[430px] overflow-hidden bg-[#2a0709] text-white lg:grid-cols-[42%_58%]" aria-labelledby="deals-title">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_28%_30%,rgba(156,27,23,.72),transparent_38%),linear-gradient(135deg,#3c0909_0%,#190707_100%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:repeating-linear-gradient(115deg,transparent_0,transparent_3px,#fff_4px,transparent_5px)]" />
        <div className="relative flex flex-col justify-center overflow-hidden px-7 py-12 sm:px-12 lg:px-[clamp(48px,6vw,100px)] lg:py-14">
          <div className="relative z-10 max-w-[520px]">
            <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#e5bd78]">The Mahaly offer</motion.p>
            <motion.h1 id="deals-title" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65 }} className="mt-3 font-serif text-[44px] font-semibold leading-[0.98] tracking-[-0.04em] sm:text-[56px] lg:text-[clamp(48px,4vw,68px)]">The pieces you saved.<br />Now within reach.</motion.h1>
            <p className="mt-5 max-w-sm text-[13px] leading-6 text-white/70">Limited-time prices from independent local brands — selected from the offers ending first.</p>
            {heroProducts.length ? (
              <>
                <div className="mt-8 rounded-[14px] border border-[#d6a45d]/70 bg-black/10 px-4 py-3 shadow-[0_15px_45px_rgba(0,0,0,.18)] backdrop-blur sm:inline-flex sm:items-center sm:gap-5">
                  <div className="flex items-center gap-2 border-b border-white/15 pb-3 text-[12px] sm:border-b-0 sm:border-r sm:pb-0 sm:pr-5"><Clock3 className="h-5 w-5 text-[#e5bd78]" strokeWidth={1.5} />Offer ends in</div>
                  <div className="mt-3 flex items-start gap-4 sm:mt-0">
                    {[{ value: countdown.days, label: "days" }, { value: countdown.hours, label: "hrs" }, { value: countdown.minutes, label: "min" }].map((part, index) => <div key={part.label} className="flex items-start gap-4"><div className="text-center"><span className="font-serif text-[25px] leading-none">{part.value}</span><span className="mt-1 block text-[8px] uppercase tracking-widest text-white/50">{part.label}</span></div>{index < 2 ? <span className="mt-1 text-[#d6a45d]">·</span> : null}</div>)}
                  </div>
                </div>
                <p className="mt-3 text-[10px] text-white/45">Prices return when the timer ends.</p>
              </>
            ) : (
              <p className="mt-8 text-[13px] text-white/60">No active offers right now — check back soon.</p>
            )}
          </div>
        </div>
        {heroProducts.length ? (
          <div className="relative z-10 min-h-[360px] overflow-x-auto bg-transparent lg:min-h-0 lg:overflow-hidden">
            <div aria-hidden className="absolute inset-0 hidden lg:grid lg:grid-cols-[1.3fr_1fr_1fr]">
              {heroProducts.map((product, index) => <HeroBackdrop key={product.id} product={product} index={index} isFirst={index === 0} isLast={index === heroProducts.length - 1} />)}
            </div>
            <div aria-hidden className="pointer-events-none absolute inset-0 z-[7] hidden bg-[#390809] opacity-95 [background-image:repeating-linear-gradient(115deg,transparent_0,transparent_3px,rgba(255,255,255,.06)_4px,transparent_5px)] lg:block [clip-path:polygon(0_0,12.6%_0,0_100%)]" />
            <svg aria-hidden viewBox="0 0 1000 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 z-[8] hidden h-full w-full lg:block">
              <path d="M 126 0 L 0 100" fill="none" stroke="white" strokeWidth="3" vectorEffect="non-scaling-stroke" />
              <path d="M 429 0 L 303 100" fill="none" stroke="white" strokeWidth="3" vectorEffect="non-scaling-stroke" />
              <path d="M 732 0 L 606 100" fill="none" stroke="white" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="relative z-10 grid min-h-[360px] w-max min-w-full grid-cols-[repeat(3,minmax(250px,1fr))] gap-[3px] lg:h-full lg:min-h-0 lg:w-full lg:grid-cols-3 lg:gap-0">
              {heroProducts.map((product, index) => <HeroDeal key={product.id} product={product} index={index} />)}
            </div>
          </div>
        ) : null}
      </section>

      <section className="mx-auto max-w-[1500px] px-5 pb-20 pt-5 sm:px-8 lg:px-12">
        <div className="relative z-20 rounded-[16px] border border-black/5 bg-white/90 px-3 shadow-[0_14px_45px_rgba(44,31,22,.10)] backdrop-blur-xl sm:px-5">
          <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
            {FILTERS.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setActiveFilter(id)} className={`relative flex min-w-[116px] flex-1 items-center justify-center gap-2.5 px-4 py-4 text-[11px] font-medium transition-colors ${activeFilter === id ? "text-mahalyred" : "text-ink-soft hover:text-ink"}`}><Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />{label}{activeFilter === id ? <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-mahalyred" /> : null}</button>)}
          </div>
        </div>

        <div id="deal-products" className="mb-5 mt-9 flex scroll-mt-28 flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-mahalyred">Limited-time edit</p><h2 className="mt-1 font-serif text-[32px] font-semibold tracking-[-0.03em]">Worth catching now</h2></div>
          <div className="flex flex-wrap items-center gap-2.5 text-[11px]"><label className="sr-only" htmlFor="deal-sort">Sort deals</label><select id="deal-sort" value={sort} onChange={(event) => setSort(event.target.value as DealSort)} className="rounded-full border border-black/10 bg-white px-4 py-2 outline-none transition focus:border-mahalyred/50"><option value="ending-soon">Ending soon</option><option value="discount-high">Biggest saving</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select>{budgetMax ? <button type="button" onClick={() => setBudgetMax(null)} className="rounded-full bg-mahalyred px-4 py-2 font-semibold text-white">Under EGP {budgetMax.toLocaleString("en-US")} ×</button> : null}<span className="ml-1 whitespace-nowrap text-ink-soft/60">{visibleProducts.length} items</span></div>
        </div>

        {visibleProducts.length ? <motion.div layout className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6"><AnimatePresence mode="popLayout">{visibleProducts.map((product, index) => <motion.div key={product.id} layout initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.38, delay: Math.min(index, 5) * 0.04 }}><CompactProductCard product={product} /></motion.div>)}</AnimatePresence></motion.div> : <div className="rounded-[18px] border border-dashed border-black/10 bg-white/55 py-16 text-center"><p className="font-serif text-2xl">No deals match this selection yet.</p><button type="button" onClick={() => { setActiveFilter("all"); setBudgetMax(null); }} className="mt-4 text-sm font-semibold text-mahalyred">View all deals</button></div>}

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <BudgetPanel limit={500} products={products} active={budgetMax === 500} onSelect={() => setBudgetMax((current) => current === 500 ? null : 500)} />
          <BudgetPanel limit={1000} products={products} active={budgetMax === 1000} onSelect={() => setBudgetMax((current) => current === 1000 ? null : 1000)} />
        </div>
        <p className="mt-8 text-center text-[10px] text-ink-soft/55">Discounts and end times are set by each brand and updated automatically.</p>
      </section>
    </div>
  );
}
