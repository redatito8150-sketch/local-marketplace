"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus, ShoppingBag, X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/lib/format";
import type { Product, ProductVariant } from "@/types";
import type { CollectionPageConfig } from "./collectionPageConfig";

function availableVariant(product: Product): ProductVariant | undefined {
  return product.variants?.find(
    (variant) => variant.availabilityStatus === "available" && variant.quantity > 0
  );
}

function ColorSwatches({ product }: { product: Product }) {
  if (product.colors.length === 0) return <span className="min-h-4" />;
  return (
    <span className="mt-2 flex min-h-4 items-center gap-1.5" aria-label={`Available colors: ${product.colors.map((color) => color.name).join(", ")}`}>
      {product.colors.map((color) => (
        <span key={`${product.id}-${color.name}`} title={color.name} className="flex h-4 w-4 items-center justify-center rounded-full border border-black/15 bg-white shadow-[0_1px_2px_rgba(0,0,0,.12)]">
          <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ backgroundColor: color.hex }} />
        </span>
      ))}
    </span>
  );
}

export default function CollectionHero({ products, config }: { products: Product[]; config: CollectionPageConfig }) {
  const { addItem } = useCart();
  const reduceMotion = useReducedMotion();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const featuredItems = useMemo(() => {
    const configured = config.featuredProductIds
      .map((id) => products.find((product) => product.id === id))
      .filter((product): product is Product => Boolean(product));
    if (!config.allowProductFallback || configured.length === 5) return configured;
    const configuredIds = new Set(configured.map((product) => product.id));
    return [...configured, ...products.filter((product) => !configuredIds.has(product.id))].slice(0, 5);
  }, [config, products]);

  const addCompleteLook = () => {
    if (adding) return;
    setAdding(true);
    const unavailable: string[] = [];
    featuredItems.forEach((product) => {
      const variant = availableVariant(product);
      if (!product.inStock || (product.variants?.length && !variant)) {
        unavailable.push(product.name);
        return;
      }
      addItem({
        productId: product.id,
        variantId: variant?.id,
        name: product.name,
        brand: product.brand,
        price: variant?.priceOverride ?? product.price,
        currency: product.currency,
        image: product.image,
        size: variant?.size ?? product.sizes[0] ?? "",
        color: variant?.color,
        quantity: 1,
      });
    });
    const addedCount = featuredItems.length - unavailable.length;
    setNotice(unavailable.length
      ? `Added ${addedCount} available items. ${unavailable.length} item${unavailable.length > 1 ? "s were" : " was"} unavailable.`
      : `Complete look added — ${addedCount} items are now in your bag.`);
    window.setTimeout(() => setAdding(false), 650);
  };

  const [titleFirst, ...titleRest] = config.title.split(" ");

  return (
    <section className={`relative overflow-hidden ${config.theme.section}`}>
      <div className={`absolute inset-0 ${config.theme.backdrop}`} />
      <div className={`absolute bottom-[-95px] left-[30%] h-[230px] w-[64%] rounded-[50%] border ${config.theme.floor}`} />
      <div className="relative mx-auto min-h-[500px] max-w-[1920px] px-6 py-12 md:min-h-[560px] md:px-12 lg:min-h-[610px] xl:px-16">
        <div className="relative z-20 max-w-[390px] pt-10 md:ml-[3%] md:pt-16">
          <h1 className="font-serif text-[52px] font-medium leading-[.98] tracking-[-.045em] text-ink md:text-[70px]">
            {titleFirst}<br />{titleRest.join(" ")}
          </h1>
          <span className={`mt-7 block h-px w-12 ${config.theme.accent}`} />
          <p className="mt-6 whitespace-pre-line text-[15px] leading-6 text-ink-soft/75">{config.description}</p>
        </div>

        <div className={`pointer-events-none absolute bottom-[2px] z-[9] hidden h-8 w-[18%] -translate-x-1/2 rounded-[50%] blur-xl lg:block ${config.modelDesktopClass.split(" ")[0]} ${config.theme.shadow}`} />
        <div className={`pointer-events-none absolute bottom-0 z-10 hidden -translate-x-1/2 lg:block ${config.modelDesktopClass}`}>
          <Image src={config.modelImage} alt={config.modelAlt} fill priority sizes="25vw" className="object-contain object-bottom drop-shadow-[0_16px_18px_rgba(55,50,45,.1)]" />
        </div>

        <div className="pointer-events-none relative z-10 mx-auto mt-6 h-[350px] w-[72%] sm:h-[410px] sm:w-[58%] lg:hidden">
          <span className={`absolute bottom-1 left-1/2 h-7 w-[62%] -translate-x-1/2 rounded-[50%] blur-xl ${config.theme.shadow}`} />
          <Image src={config.modelImage} alt={config.modelAlt} fill priority sizes="(max-width: 639px) 72vw, 58vw" className="object-contain object-bottom drop-shadow-[0_14px_16px_rgba(55,50,45,.1)]" />
        </div>

        <div className="absolute inset-0 hidden lg:block">
          {featuredItems.map((product, index) => {
            const placement = config.placements[index];
            const active = activeId === product.id;
            const neighborShift = activeId && !active ? (index % 2 ? 4 : -4) : 0;
            return (
              <motion.div key={product.id} className={`absolute h-[280px] w-[154px] ${placement.className}`} style={{ zIndex: active ? 40 : placement.zIndex }} animate={{ y: active ? -10 : 0, x: neighborShift, scale: active ? 1.055 : activeId ? 0.985 : 1, rotate: active ? placement.rotation * 0.25 : placement.rotation }} transition={{ duration: reduceMotion ? 0 : 0.28, ease: "easeOut" }} onHoverStart={() => setActiveId(product.id)} onHoverEnd={() => setActiveId(null)}>
                <Link href={`/product/${product.id}`} onFocus={() => setActiveId(product.id)} onBlur={() => setActiveId(null)} className={`group flex h-full flex-col overflow-hidden rounded-[10px] border p-3.5 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-mahalyred/40 ${config.theme.card}`}>
                  <span className="truncate text-[10px] font-semibold uppercase text-ink">{product.name}</span>
                  <span className="mt-1 text-[10px] text-ink-soft/70">{formatPrice(product.price, product.currency)}</span>
                  <ColorSwatches product={product} />
                  <span className="relative mt-2 flex-1"><Image src={product.image} alt="" fill sizes="154px" className="object-contain object-bottom" /></span>
                </Link>
              </motion.div>
            );
          })}
        </div>

        <div className="relative z-20 mt-10 flex gap-3 overflow-x-auto pb-3 lg:hidden">
          {featuredItems.map((product) => (
            <Link key={product.id} href={`/product/${product.id}`} className={`w-[154px] shrink-0 rounded-xl border p-3 backdrop-blur ${config.theme.card}`}>
              <div className="relative h-32"><Image src={product.image} alt={product.name} fill sizes="154px" className="object-contain" /></div>
              <p className="mt-2 truncate text-[11px] font-medium">{product.name}</p>
              <p className="mt-1 text-[10px] text-ink-soft/65">{formatPrice(product.price, product.currency)}</p>
              <ColorSwatches product={product} />
            </Link>
          ))}
        </div>

        <div className={`relative z-30 mt-3 flex justify-start md:absolute md:bottom-20 md:mt-0 ${config.completeLookClass}`}>
          <button type="button" onClick={addCompleteLook} disabled={adding || featuredItems.length === 0} className="flex min-w-[245px] items-center justify-between rounded-[10px] border border-white bg-white/90 px-4 py-3 text-left shadow-card backdrop-blur transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-mahalyred/40 disabled:opacity-60">
            <span className="flex items-center gap-3"><ShoppingBag className="h-5 w-5 text-mahalyred" /><span><span className="block text-[10px] font-semibold">COMPLETE FEATURED LOOK</span><span className="mt-1 block text-[10px] text-ink-soft/60">{featuredItems.length} curated pieces</span></span></span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-ink/35"><Plus className="h-4 w-4" /></span>
          </button>
        </div>
      </div>

      {notice && <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 z-[80] flex w-[min(92vw,520px)] -translate-x-1/2 items-center justify-between rounded-xl bg-ink px-5 py-4 text-[13px] text-white shadow-card"><span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notification"><X className="h-4 w-4" /></button></div>}
    </section>
  );
}
