"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Leaf, ShieldCheck, Truck, RefreshCw, Headphones } from "lucide-react";
import type { HomeHeroContent, HomeHeroTilesContent } from "@/types";

const TILE_ORDER: (keyof HomeHeroTilesContent)[] = ["women", "men", "kids", "home"];

export const DEFAULT_HOME_BENEFITS = [
  { icon: Leaf, title: "Curated with purpose", detail: "Handpicked local brands" },
  { icon: ShieldCheck, title: "Secure payments", detail: "Safe & trusted checkout" },
  { icon: Truck, title: "Fast delivery", detail: "Across Egypt" },
  { icon: RefreshCw, title: "Easy returns", detail: "14 days to return" },
  { icon: Headphones, title: "Support local", detail: "Empowering creators" },
];

export type HomeBenefit = { title: string; detail: string };

export default function Hero({ content, tiles, benefits = DEFAULT_HOME_BENEFITS }: { content: HomeHeroContent; tiles: HomeHeroTilesContent; benefits?: HomeBenefit[] }) {
  const reduceMotion = useReducedMotion();
  const reveal = {
    hidden: { opacity: 0, y: 24, filter: "blur(10px)" },
    visible: { opacity: 1, y: 0, filter: "blur(0px)" },
  };

  return (
    <>
      <section
        id="home"
        className="relative overflow-hidden border-b border-white/20 bg-[linear-gradient(120deg,rgba(250,250,248,.25)_0%,rgba(220,230,236,.13)_48%,rgba(231,211,174,.10)_100%)]"
      >
        <div className="hero-leaf" aria-hidden />
        <div className="mx-auto grid max-w-[1920px] gap-10 px-6 py-6 md:px-10 lg:grid-cols-[minmax(430px,0.92fr)_minmax(0,1.78fr)] lg:items-center lg:px-12 lg:py-6 xl:px-16">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.12, delayChildren: reduceMotion ? 0 : 0.15 } } }}
            className="relative z-10 mx-auto w-full max-w-[510px] py-6 lg:mx-0 lg:pl-20"
          >
            <motion.p variants={reveal} transition={{ duration: 0.65 }} className="mb-4 text-[12px] font-bold uppercase tracking-[0.14em] text-mahalyred">Curated local. Meaningful.</motion.p>
            <h1 className="font-serif text-[43px] font-semibold leading-[0.98] tracking-[-0.045em] text-ink [text-shadow:0_2px_24px_rgba(255,255,255,.75)] sm:text-[56px] lg:text-[61px]">
              {content.headingLines.map((line) => <motion.span key={line} variants={reveal} transition={{ duration: 0.75 }} className="block">{line}</motion.span>)}
            </h1>
            <motion.p variants={reveal} transition={{ duration: 0.7 }} className="mt-5 max-w-[405px] text-[14px] leading-6 text-ink-soft/80">{content.subheading}</motion.p>
            <motion.div variants={reveal} transition={{ duration: 0.7 }} className="mt-5 flex flex-wrap gap-4">
              <Link href="/brands" className="inline-flex h-12 items-center gap-8 rounded-full bg-mahalyred px-7 text-[13px] font-semibold text-white transition-colors hover:bg-mahalyred-dark">
                Explore brands <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href={content.ctaHref ?? "/join-as-a-brand"} className="inline-flex h-12 items-center rounded-full border border-stone-150 bg-white/40 px-10 text-[13px] font-semibold text-ink transition-colors hover:bg-white">
                {content.ctaLabel}
              </Link>
            </motion.div>
          </motion.div>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.1, delayChildren: reduceMotion ? 0 : 0.24 } } }}
            className="relative z-10 grid grid-cols-2 gap-4 sm:grid-cols-4"
          >
            {TILE_ORDER.map((key, i) => {
              const tile = tiles[key];
              return (
                <motion.div
                  key={key}
                  variants={{
                    hidden: { opacity: 0, x: reduceMotion ? 0 : 110 + i * 18, rotate: reduceMotion ? 0 : 3 - i * 2, scale: reduceMotion ? 1 : 0.9 },
                    visible: { opacity: 1, x: 0, rotate: 0, scale: 1 },
                  }}
                  transition={{ type: "spring", stiffness: 105, damping: 18 }}
                >
                  <Link href={tile.href} className="group relative block aspect-[0.74] overflow-hidden rounded-[15px] bg-stone-100">
                    <Image src={tile.image} alt={`${tile.label} collection`} fill priority={i < 2} sizes="(max-width: 640px) 48vw, 24vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.035]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
                    <div className="absolute bottom-5 left-5 text-white">
                      <h2 className="font-serif text-[25px] font-semibold leading-none">{tile.label}</h2>
                      <span className="mt-3 flex items-center gap-2 text-[12px] font-medium">Shop <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/80"><ArrowRight className="h-3 w-3" /></span></span>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      <section className="border-b border-white/20 bg-cream/58 backdrop-blur-[2px]">
        <div className="mx-auto grid max-w-[1840px] grid-cols-2 px-5 py-5 sm:grid-cols-3 lg:grid-cols-5 lg:px-12">
          {benefits.map(({ title, detail }, index) => {
            const Icon = DEFAULT_HOME_BENEFITS[index]?.icon ?? Leaf;
            return (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: reduceMotion ? 0 : 0.8 + index * 0.08 }}
              className={`flex items-center justify-center gap-4 px-4 py-2 ${index ? "lg:border-l lg:border-stone-150" : ""}`}
            >
              <Icon className="h-7 w-7 shrink-0 text-ink" strokeWidth={1.45} />
              <div><p className="text-[11px] font-semibold text-ink">{title}</p><p className="mt-1 text-[10px] text-ink-soft/65">{detail}</p></div>
            </motion.div>
          )})}
        </div>
      </section>
    </>
  );
}
