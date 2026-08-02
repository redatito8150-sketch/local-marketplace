"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Layers3, X } from "lucide-react";
import { useState } from "react";
import type { CollectionExperienceItem, CollectionExperienceProduct } from "@/lib/data/collectionExperience";

const priceFormatters = {
  EGP: new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }),
  USD: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }),
};

function formatPrice(product: CollectionExperienceProduct) {
  return priceFormatters[product.currency].format(product.price);
}

function ProductTile({ product, index }: { product: CollectionExperienceProduct; index: number }) {
  const content = (
    <>
      <div className="relative aspect-[4/5] overflow-hidden rounded-[14px] bg-[#eee5db]">
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 72vw, (max-width: 1024px) 38vw, 18vw"
          className="object-cover transition-transform duration-700 group-hover:scale-[1.045]"
        />
        {product.isDemo ? (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2 py-1 text-[9px] font-bold uppercase tracking-[.08em] text-white backdrop-blur-sm">
            Preview
          </span>
        ) : (
          <span className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-[#3a2826] opacity-0 shadow-sm backdrop-blur-sm transition duration-300 group-hover:opacity-100">
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-[13px] font-semibold text-[#332b27]">{product.name}</h4>
          <p className="mt-1 text-[11px] text-[#847a73]">
            {product.isDemo ? "Preview only — not for sale" : product.note}
          </p>
        </div>
        <span className="shrink-0 text-[12px] font-semibold text-[#5a4d46]">{formatPrice(product)}</span>
      </div>
    </>
  );

  const className = "collection-product-enter group block min-w-0";
  const style = { animationDelay: `${120 + index * 75}ms` };
  return product.href ? (
    <Link href={product.href} className={className} style={style}>{content}</Link>
  ) : (
    <article className={className} style={style}>{content}</article>
  );
}

function ProductRail({ products }: { products: CollectionExperienceProduct[] }) {
  return (
    <div className="grid grid-cols-[repeat(4,minmax(165px,1fr))] gap-4 overflow-x-auto pb-3 [scrollbar-width:thin] sm:grid-cols-2 lg:grid-cols-4 lg:overflow-visible lg:pb-0">
      {products.slice(0, 4).map((product, index) => <ProductTile key={product.id} product={product} index={index} />)}
    </div>
  );
}

function CollectionCopy({ item, compact = false }: { item: CollectionExperienceItem; compact?: boolean }) {
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {item.isDemo ? (
          <span className="rounded-full border border-white/[0.35] bg-black/25 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.1em] text-white backdrop-blur-sm">Preview — coming soon</span>
        ) : (
          <>
            <span className="rounded-full border border-white/[0.35] bg-black/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.1em] text-white/[0.85] backdrop-blur-sm">{item.eyebrow}</span>
            <span className="rounded-full border border-white/[0.35] bg-black/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.1em] text-white/[0.85] backdrop-blur-sm">{item.season}</span>
          </>
        )}
      </div>
      <h2 className={`${compact ? "mt-3 text-[30px]" : "mt-5 text-[46px] sm:text-[58px]"} font-serif leading-[0.92] tracking-[-0.035em] text-white`}>{item.name}</h2>
      {!compact && <p className="mt-4 max-w-md text-[13px] leading-6 text-white/[0.78]">{item.description}</p>}
    </div>
  );
}

export default function BrandCollectionsExperience({
  brandName,
  collections,
}: {
  brandName: string;
  collections: CollectionExperienceItem[];
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const featured = collections[0];
  const supporting = collections.slice(1, 4);
  const active = collections.find((item) => item.id === activeId) ?? null;

  const selectCollection = (id: string) => setActiveId((current) => current === id ? null : id);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-6 pb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#9b3440]">Curated by {brandName}</p>
          <h1 className="mt-2 font-serif text-3xl tracking-[-.02em] text-[#2e2722] sm:text-4xl">Collections, reimagined.</h1>
        </div>
        <p className="hidden max-w-sm text-right text-xs leading-5 text-[#796e66] md:block">Select a story to reveal its pieces without leaving the page.</p>
      </div>

      {featured && activeId !== featured.id ? (
        <button
          type="button"
          onClick={() => selectCollection(featured.id)}
          aria-expanded={false}
          className="group relative block min-h-[360px] w-full overflow-hidden rounded-[22px] bg-[#d9c6b5] text-left sm:min-h-[430px]"
        >
          <Image src={featured.coverImage} alt="" fill priority sizes="(max-width: 1400px) 100vw, 1280px" className="object-cover object-center transition duration-1000 ease-out group-hover:scale-[1.025]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(25,24,21,.62)_0%,rgba(25,24,21,.2)_45%,rgba(25,24,21,.02)_72%)]" />
          <div className="absolute inset-y-0 left-0 flex max-w-xl flex-col justify-center p-7 sm:p-11 lg:p-14">
            <CollectionCopy item={featured} />
            <span className="mt-6 inline-flex w-fit items-center gap-3 rounded-full bg-white px-5 py-3 text-[11px] font-bold text-[#3d302b] shadow-sm transition duration-300 group-hover:gap-4">
              Explore collection <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </button>
      ) : featured && (
        <section key={`featured-${featured.id}`} className="collection-feature-enter overflow-hidden rounded-[22px] border border-[#e6d9ce] bg-[#fffaf5] shadow-[0_16px_50px_rgba(63,42,31,.07)]">
          <div className="grid lg:grid-cols-[0.72fr_1.28fr]">
            <div className="relative min-h-[330px] overflow-hidden lg:min-h-[560px]">
              <Image src={featured.coverImage} alt="" fill sizes="(max-width: 1024px) 100vw, 38vw" className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
              <button type="button" onClick={() => setActiveId(null)} aria-label="Close collection" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-[#3d302b] backdrop-blur"><X className="h-4 w-4" /></button>
              <div className="absolute inset-x-0 bottom-0 p-7 sm:p-9"><CollectionCopy item={featured} compact /></div>
            </div>
            <div className="flex min-w-0 flex-col justify-center p-5 sm:p-8 lg:p-9">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div><span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#9b3440]"><Layers3 className="h-3.5 w-3.5" />The edit</span><h3 className="mt-1 font-serif text-2xl text-[#302824]">Pieces from {featured.name}</h3></div>
                <span className="text-[11px] text-[#8b8078]">{featured.products.length} pieces</span>
              </div>
              <ProductRail products={featured.products} />
              <p className="collection-product-enter mt-7 border-t border-[#eadfd5] pt-5 text-xs leading-5 text-[#766b64]" style={{ animationDelay: "420ms" }}>{featured.description}</p>
            </div>
          </div>
        </section>
      )}

      {supporting.length > 0 && (
        <div className={`grid gap-4 ${active && active.id !== featured?.id ? "grid-cols-3" : "sm:grid-cols-3"}`}>
          {supporting.map((item) => {
            const isActive = activeId === item.id;
            const isCompressed = Boolean(active && active.id !== featured?.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectCollection(item.id)}
                aria-expanded={isActive}
                className={`group relative overflow-hidden rounded-[18px] bg-[#d9cec4] text-left transition-[min-height,filter,opacity] duration-500 ${isCompressed ? "min-h-[116px] sm:min-h-[138px]" : "min-h-[340px] sm:min-h-[430px]"} ${isActive ? "ring-2 ring-[#8f2634] ring-offset-2" : ""}`}
              >
                <Image src={item.coverImage} alt="" fill sizes="(max-width: 640px) 100vw, 33vw" className={`object-cover transition duration-700 ${isCompressed ? "group-hover:scale-105" : "group-hover:scale-[1.035]"}`} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/10 to-transparent" />
                <div className={`absolute inset-x-0 bottom-0 ${isCompressed ? "p-3 sm:p-4" : "p-6"}`}>
                  {!isCompressed && (
                    <div className="mb-3 flex gap-1.5">
                      {item.isDemo ? (
                        <span className="rounded-full bg-black/45 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-white backdrop-blur">Preview — coming soon</span>
                      ) : (
                        <>
                          <span className="rounded-full bg-black/25 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-white/[0.85] backdrop-blur">{item.eyebrow}</span>
                          <span className="rounded-full bg-black/25 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-white/[0.85] backdrop-blur">{item.season}</span>
                        </>
                      )}
                    </div>
                  )}
                  <h3 className={`${isCompressed ? "text-[15px] sm:text-xl" : "text-[28px] lg:text-[33px]"} font-serif leading-[.96] tracking-[-.025em] text-white`}>{item.name}</h3>
                  {!isCompressed && <><p className="mt-3 line-clamp-2 text-[11px] leading-5 text-white/[0.72]">{item.description}</p><span className="mt-5 inline-flex items-center gap-2 text-[10px] font-semibold text-white">View collection <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" /></span></>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {active && active.id !== featured?.id && (
        <section key={`supporting-${active.id}`} className="collection-panel-enter overflow-hidden rounded-[20px] border border-[#e5d8cd] bg-[#fffaf5] p-5 shadow-[0_14px_45px_rgba(63,42,31,.065)] sm:p-7 lg:p-9">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#9b3440]">
                {active.isDemo ? "Preview — coming soon" : `${active.eyebrow} · ${active.season}`}
              </p>
              <h3 className="mt-2 font-serif text-3xl tracking-[-.025em] text-[#302824] sm:text-4xl">{active.name}</h3>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-[#776c65]">{active.description}</p>
            </div>
            <button type="button" onClick={() => setActiveId(null)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#d9ccc0] px-4 text-[11px] font-semibold text-[#594d47]"><X className="h-3.5 w-3.5" />Close edit</button>
          </div>
          <ProductRail products={active.products} />
        </section>
      )}
    </div>
  );
}
