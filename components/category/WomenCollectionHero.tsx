"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Plus, ShoppingBag, X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/lib/format";
import type { Product, ProductVariant } from "@/types";

type LookPlacement = {
  className: string;
  rotation: number;
  zIndex: number;
  objectPosition?: string;
};

const PLACEMENTS: LookPlacement[] = [
  { className: "left-[34%] top-[17%]", rotation: -4, zIndex: 3 },
  { className: "left-[43%] top-[7%]", rotation: 2.5, zIndex: 2 },
  { className: "left-[40%] top-[49%]", rotation: 3.5, zIndex: 4 },
  { className: "right-[26%] top-[10%]", rotation: -2.5, zIndex: 2 },
  { className: "right-[15%] top-[18%]", rotation: 3, zIndex: 3 },
  { className: "right-[6%] top-[43%]", rotation: -4, zIndex: 2 },
];

function availableVariant(product: Product): ProductVariant | undefined {
  return product.variants?.find(
    (variant) => variant.availabilityStatus === "available" && variant.quantity > 0
  );
}

export default function WomenCollectionHero({ products }: { products: Product[] }) {
  const { addItem } = useCart();
  const reduceMotion = useReducedMotion();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const featuredItems = useMemo(() => products.slice(0, 6), [products]);
  const model = products[3] ?? products.find((product) => /dress|top|blazer|vest|set/i.test(product.name)) ?? products[0];

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
    setNotice(
      unavailable.length
        ? `Added ${addedCount} available items. ${unavailable.length} item${unavailable.length > 1 ? "s were" : " was"} unavailable.`
        : `Complete look added — ${addedCount} items are now in your bag.`
    );
    window.setTimeout(() => setAdding(false), 650);
  };

  return (
    <section className="relative overflow-hidden bg-[#eef0f1]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_61%_26%,rgba(255,255,255,.95),transparent_28%),linear-gradient(120deg,#f6f4f1_0%,#e8ecef_55%,#f3efeb_100%)]" />
      <div className="absolute bottom-[-95px] left-[30%] h-[230px] w-[64%] rounded-[50%] border border-white/90 shadow-[0_0_32px_rgba(255,255,255,.95)]" />

      <div className="relative mx-auto min-h-[500px] max-w-[1920px] px-6 py-12 md:min-h-[560px] md:px-12 lg:min-h-[610px] xl:px-16">
        <div className="relative z-20 max-w-[390px] pt-10 md:ml-[3%] md:pt-16">
          <h1 className="font-serif text-[52px] font-medium leading-[.98] tracking-[-.045em] text-ink md:text-[70px]">
            Women’s<br />Collection
          </h1>
          <span className="mt-7 block h-px w-12 bg-mahalyred" />
          <p className="mt-6 text-[15px] leading-6 text-ink-soft/75">
            Timeless pieces. Modern silhouettes.<br />Curated for every moment.
          </p>
          <Link href="#products" className="mt-7 inline-flex h-12 items-center gap-9 rounded-[7px] bg-mahalyred px-6 text-[13px] font-semibold text-white shadow-soft transition-colors hover:bg-mahalyred-dark">
            Shop the Collection <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {model && (
          <Link href={`/product/${model.id}`} className="absolute bottom-0 left-[51%] z-10 hidden h-[92%] w-[23%] -translate-x-1/2 lg:block">
            <Image src={model.image} alt={model.name} fill priority sizes="24vw" className="object-contain object-bottom mix-blend-multiply drop-shadow-[0_18px_20px_rgba(55,50,45,.12)]" />
          </Link>
        )}

        <div className="absolute inset-0 hidden lg:block">
          {featuredItems.map((product, index) => {
            const placement = PLACEMENTS[index];
            const active = activeId === product.id;
            const neighborShift = activeId && !active ? (index % 2 ? 4 : -4) : 0;
            return (
              <motion.div
                key={product.id}
                className={`absolute h-[250px] w-[132px] ${placement.className}`}
                style={{ zIndex: active ? 40 : placement.zIndex }}
                animate={{
                  y: active ? -10 : 0,
                  x: neighborShift,
                  scale: active ? 1.055 : activeId ? 0.985 : 1,
                  rotate: active ? placement.rotation * 0.25 : placement.rotation,
                }}
                transition={{ duration: reduceMotion ? 0 : 0.28, ease: "easeOut" }}
                onHoverStart={() => setActiveId(product.id)}
                onHoverEnd={() => setActiveId(null)}
              >
                <Link
                  href={`/product/${product.id}`}
                  onFocus={() => setActiveId(product.id)}
                  onBlur={() => setActiveId(null)}
                  className="group flex h-full flex-col overflow-hidden rounded-[9px] border border-white/80 bg-white/65 p-3 shadow-[0_14px_34px_rgba(31,39,45,.08)] backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-mahalyred/40"
                >
                  <span className="truncate text-[9px] font-semibold uppercase text-ink">{product.name}</span>
                  <span className="mt-1 text-[9px] text-ink-soft/70">{formatPrice(product.price, product.currency)}</span>
                  <span className="relative mt-3 flex-1"><Image src={product.image} alt="" fill sizes="132px" className="object-contain object-bottom" /></span>
                </Link>
              </motion.div>
            );
          })}
        </div>

        <div className="relative z-20 mt-10 flex gap-3 overflow-x-auto pb-3 lg:hidden">
          {featuredItems.map((product) => (
            <Link key={product.id} href={`/product/${product.id}`} className="w-[138px] shrink-0 rounded-xl border border-white bg-white/75 p-3 shadow-soft backdrop-blur">
              <div className="relative h-28"><Image src={product.image} alt={product.name} fill sizes="138px" className="object-contain" /></div>
              <p className="mt-2 truncate text-[10px] font-medium">{product.name}</p>
              <p className="mt-1 text-[10px] text-ink-soft/65">{formatPrice(product.price, product.currency)}</p>
            </Link>
          ))}
        </div>

        <div className="relative z-30 mt-3 flex justify-start md:absolute md:bottom-20 md:left-[58%] md:mt-0">
          <button onClick={addCompleteLook} disabled={adding || featuredItems.length === 0} className="flex min-w-[245px] items-center justify-between rounded-[10px] border border-white bg-white/90 px-4 py-3 text-left shadow-card backdrop-blur transition-transform hover:-translate-y-0.5 disabled:opacity-60">
            <span className="flex items-center gap-3"><ShoppingBag className="h-5 w-5 text-mahalyred" /><span><span className="block text-[10px] font-semibold">COMPLETE FEATURED LOOK</span><span className="mt-1 block text-[10px] text-ink-soft/60">{featuredItems.length} curated pieces</span></span></span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-ink/35"><Plus className="h-4 w-4" /></span>
          </button>
        </div>
      </div>

      {notice && (
        <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 z-[80] flex w-[min(92vw,520px)] -translate-x-1/2 items-center justify-between rounded-xl bg-ink px-5 py-4 text-[13px] text-white shadow-card">
          <span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Dismiss notification"><X className="h-4 w-4" /></button>
        </div>
      )}
    </section>
  );
}
