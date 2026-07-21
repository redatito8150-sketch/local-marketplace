"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Leaf, ShieldCheck, Truck, RefreshCw, Headphones } from "lucide-react";
import type { HomeHeroContent, HomeHeroTilesContent } from "@/types";

const TILE_ORDER: (keyof HomeHeroTilesContent)[] = ["women", "men", "kids", "home"];

const benefits = [
  { icon: Leaf, title: "Curated with purpose", detail: "Handpicked local brands" },
  { icon: ShieldCheck, title: "Secure payments", detail: "Safe & trusted checkout" },
  { icon: Truck, title: "Fast delivery", detail: "Across Egypt" },
  { icon: RefreshCw, title: "Easy returns", detail: "14 days to return" },
  { icon: Headphones, title: "Support local", detail: "Empowering creators" },
];

export default function Hero({ content, tiles }: { content: HomeHeroContent; tiles: HomeHeroTilesContent }) {
  return (
    <>
      <section id="home" className="relative overflow-hidden border-b border-stone-150/60">
        <div className="hero-leaf" aria-hidden />
        <div className="mx-auto grid max-w-[1920px] gap-10 px-6 py-6 md:px-10 lg:grid-cols-[minmax(430px,0.92fr)_minmax(0,1.78fr)] lg:items-center lg:px-12 lg:py-6 xl:px-16">
          <div className="relative z-10 mx-auto w-full max-w-[510px] py-6 lg:mx-0 lg:pl-20">
            <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.14em] text-mahalyred">Curated local. Meaningful.</p>
            <h1 className="font-serif text-[43px] font-semibold leading-[0.98] tracking-[-0.045em] text-ink sm:text-[56px] lg:text-[61px]">
              {content.headingLines.map((line) => <span key={line} className="block">{line}</span>)}
            </h1>
            <p className="mt-5 max-w-[405px] text-[14px] leading-6 text-ink-soft/80">{content.subheading}</p>
            <div className="mt-5 flex flex-wrap gap-4">
              <Link href="/brands" className="inline-flex h-12 items-center gap-8 rounded-full bg-mahalyred px-7 text-[13px] font-semibold text-white transition-colors hover:bg-mahalyred-dark">
                Explore brands <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/join-as-a-brand" className="inline-flex h-12 items-center rounded-full border border-stone-150 bg-white/40 px-10 text-[13px] font-semibold text-ink transition-colors hover:bg-white">
                Join as a Brand
              </Link>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {TILE_ORDER.map((key, i) => {
              const tile = tiles[key];
              return (
                <Link key={key} href={tile.href} className="group relative block aspect-[0.74] overflow-hidden rounded-[15px] bg-stone-100">
                  <Image src={tile.image} alt={`${tile.label} collection`} fill priority={i < 2} sizes="(max-width: 640px) 48vw, 24vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.035]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
                  <div className="absolute bottom-5 left-5 text-white">
                    <h2 className="font-serif text-[25px] font-semibold leading-none">{tile.label}</h2>
                    <span className="mt-3 flex items-center gap-2 text-[12px] font-medium">Shop <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/80"><ArrowRight className="h-3 w-3" /></span></span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-stone-150">
        <div className="mx-auto grid max-w-[1840px] grid-cols-2 px-5 py-5 sm:grid-cols-3 lg:grid-cols-5 lg:px-12">
          {benefits.map(({ icon: Icon, title, detail }, index) => (
            <div key={title} className={`flex items-center justify-center gap-4 px-4 py-2 ${index ? "lg:border-l lg:border-stone-150" : ""}`}>
              <Icon className="h-7 w-7 shrink-0 text-ink" strokeWidth={1.45} />
              <div><p className="text-[11px] font-semibold text-ink">{title}</p><p className="mt-1 text-[10px] text-ink-soft/65">{detail}</p></div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
