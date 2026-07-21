"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus, ShoppingBag, X } from "lucide-react";
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
  { className: "left-[31%] top-[13%]", rotation: -4, zIndex: 3 },
  { className: "left-[37%] top-[48%]", rotation: 3.5, zIndex: 4 },
  { className: "right-[24%] top-[7%]", rotation: -2.5, zIndex: 2 },
  { className: "right-[12%] top-[18%]", rotation: 3, zIndex: 3 },
  { className: "right-[3%] top-[45%]", rotation: -4, zIndex: 2 },
];

const FEATURED_LOOK_PRODUCT_IDS = [
  "blazer-5f53",
  "sleevless-shirt-tk89",
  "striped-pattern-loose-trousers-b5zk",
  "iridescent-yoke-sandals-ou3n",
  "hand-bag-9izs",
] as const;

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

  const featuredItems = useMemo(
    () =>
      FEATURED_LOOK_PRODUCT_IDS.map((id) => products.find((product) => product.id === id)).filter(
        (product): product is Product => Boolean(product)
      ),
    [products]
  );

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
    <section className="relative overflow-hidden bg-[#f2e8e9]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_58%_25%,rgba(255,255,255,.82),transparent_30%),linear-gradient(120deg,#faf4f4_0%,#ead7da_46%,#f4e8e7_72%,#e6cfd3_100%)]" />
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
        </div>

        <div className="pointer-events-none absolute bottom-[2px] left-[56%] z-[9] hidden h-8 w-[18%] -translate-x-1/2 rounded-[50%] bg-slate-700/15 blur-xl lg:block" />
        <div className="pointer-events-none absolute bottom-0 left-[56%] z-10 hidden h-[95%] w-[25%] -translate-x-1/2 lg:block">
          <Image
            src="/images/women-hero-model.png"
            alt="Woman wearing the featured collection"
            fill
            priority
            sizes="25vw"
            className="object-contain object-bottom drop-shadow-[0_16px_18px_rgba(55,50,45,.1)]"
          />
        </div>

        <div className="pointer-events-none relative z-10 mx-auto mt-6 h-[350px] w-[72%] sm:h-[410px] sm:w-[58%] lg:hidden">
          <span className="absolute bottom-1 left-1/2 h-7 w-[62%] -translate-x-1/2 rounded-[50%] bg-slate-700/15 blur-xl" />
          <Image
            src="/images/women-hero-model.png"
            alt="Woman wearing the featured collection"
            fill
            priority
            sizes="(max-width: 639px) 72vw, 58vw"
            className="object-contain object-bottom drop-shadow-[0_14px_16px_rgba(55,50,45,.1)]"
          />
        </div>

        <div className="absolute inset-0 hidden lg:block">
          {featuredItems.map((product, index) => {
            const placement = PLACEMENTS[index];
            const active = activeId === product.id;
            const neighborShift = activeId && !active ? (index % 2 ? 4 : -4) : 0;
            return (
              <motion.div
                key={product.id}
                className={`absolute h-[280px] w-[154px] ${placement.className}`}
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
                  className="group flex h-full flex-col overflow-hidden rounded-[10px] border border-white/80 bg-white/70 p-3.5 shadow-[0_14px_34px_rgba(78,31,42,.1)] backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-mahalyred/40"
                >
                  <span className="truncate text-[10px] font-semibold uppercase text-ink">{product.name}</span>
                  <span className="mt-1 text-[10px] text-ink-soft/70">{formatPrice(product.price, product.currency)}</span>
                  <span className="mt-2 flex min-h-4 items-center gap-1.5" aria-label={`Available colors: ${product.colors.map((color) => color.name).join(", ")}`}>
                    {product.colors.map((color) => (
                      <span key={`${product.id}-${color.name}`} title={color.name} className="flex h-4 w-4 items-center justify-center rounded-full border border-black/15 bg-white shadow-[0_1px_2px_rgba(0,0,0,.12)]">
                        <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ backgroundColor: color.hex }} />
                      </span>
                    ))}
                  </span>
                  <span className="relative mt-2 flex-1"><Image src={product.image} alt="" fill sizes="154px" className="object-contain object-bottom" /></span>
                </Link>
              </motion.div>
            );
          })}
        </div>

        <div className="relative z-20 mt-10 flex gap-3 overflow-x-auto pb-3 lg:hidden">
          {featuredItems.map((product) => (
            <Link key={product.id} href={`/product/${product.id}`} className="w-[154px] shrink-0 rounded-xl border border-white bg-white/75 p-3 shadow-soft backdrop-blur">
              <div className="relative h-32"><Image src={product.image} alt={product.name} fill sizes="154px" className="object-contain" /></div>
              <p className="mt-2 truncate text-[11px] font-medium">{product.name}</p>
              <p className="mt-1 text-[10px] text-ink-soft/65">{formatPrice(product.price, product.currency)}</p>
              <div className="mt-2 flex min-h-4 items-center gap-1.5" aria-label={`Available colors: ${product.colors.map((color) => color.name).join(", ")}`}>
                {product.colors.map((color) => (
                  <span key={`${product.id}-${color.name}`} title={color.name} className="flex h-4 w-4 items-center justify-center rounded-full border border-black/15 bg-white shadow-[0_1px_2px_rgba(0,0,0,.12)]">
                    <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ backgroundColor: color.hex }} />
                  </span>
                ))}
              </div>
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
