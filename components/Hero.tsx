"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, MotionConfig } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import type { HomeHeroContent, HomeHeroTilesContent } from "@/types";

const TILE_ORDER: (keyof HomeHeroTilesContent)[] = ["women", "men", "kids", "home"];

export default function Hero({ content, tiles }: { content: HomeHeroContent; tiles: HomeHeroTilesContent }) {
  return (
    <MotionConfig reducedMotion="never">
    <section id="home" className="home-hero-scene relative overflow-hidden border-b border-white/20">
      <div className="home-hero-vignette" aria-hidden />
      <div className="relative z-10 mx-auto flex min-h-[650px] max-w-[1560px] flex-col px-5 pb-12 pt-9 sm:px-8 lg:min-h-[700px] lg:px-12 lg:pt-11">
        <motion.div
          initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-mahalyred">A marketplace made in Egypt</p>
          <h1 className="font-serif text-[42px] font-semibold leading-[0.96] tracking-[-0.045em] text-ink sm:text-[58px] lg:text-[72px]">
            {content.headingLines.slice(0, 2).map((line) => <span key={line} className="block">{line}</span>)}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[13px] leading-6 text-ink/65 sm:text-[14px]">{content.subheading}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 38 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto mt-6"
        >
          <Link
            href="/shop/all"
            className="group inline-flex h-12 items-center gap-5 rounded-full border border-white/35 bg-black/[0.78] px-8 text-[11px] font-bold uppercase tracking-[0.2em] text-white shadow-[0_16px_42px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.16)] backdrop-blur-lg transition duration-500 hover:-translate-y-0.5 hover:border-white/55 hover:bg-mahalyred"
          >
            Shop all
            <ArrowUpRight className="h-4 w-4 transition-transform duration-500 group-hover:rotate-45" />
          </Link>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.1, delayChildren: 0.55 } } }}
          className="mt-20 grid grid-cols-2 gap-3 sm:gap-4 lg:mt-24 lg:grid-cols-4"
        >
          {TILE_ORDER.map((key, index) => {
            const tile = tiles[key];
            return (
              <motion.div
                key={key}
                variants={{
                  hidden: { opacity: 0, y: 55, scaleX: 0.72 },
                  visible: { opacity: 1, y: 0, scaleX: 1 },
                }}
                transition={{ type: "spring", stiffness: 110, damping: 17 }}
              >
                <Link
                  href={tile.href}
                  className="group relative block h-[84px] overflow-hidden rounded-[999px] border border-white/55 bg-stone-200 shadow-[0_14px_34px_rgba(34,24,19,.16)] sm:h-[100px]"
                >
                  <Image src={tile.image} alt={`${tile.label} collection`} fill priority={index < 2} sizes="(max-width: 1024px) 48vw, 24vw" className="object-cover transition duration-700 group-hover:scale-110 group-hover:saturate-125" />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/72 via-black/25 to-black/5 transition-colors duration-500 group-hover:from-mahalyred/85" />
                  <div className="absolute inset-0 flex items-center justify-between px-5 text-white sm:px-7">
                    <div>
                      <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/55">Explore</span>
                      <h2 className="font-serif text-[21px] font-semibold sm:text-[25px]">{tile.label}</h2>
                    </div>
                    <ArrowUpRight className="h-5 w-5 transition-transform duration-500 group-hover:rotate-45 group-hover:scale-125" />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
    </MotionConfig>
  );
}
