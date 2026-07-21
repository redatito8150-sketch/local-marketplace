"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Store } from "lucide-react";
import type { HomeHeroContent, HomeHeroTilesContent } from "@/types";

const MotionLink = motion(Link);

const TILE_ORDER: (keyof HomeHeroTilesContent)[] = ["women", "men", "kids", "home"];

export default function Hero({
  content,
  tiles,
}: {
  content: HomeHeroContent;
  tiles: HomeHeroTilesContent;
}) {
  return (
    <section
      id="home"
      className="relative mx-auto grid max-w-screen2xl grid-cols-1 items-center gap-12 overflow-hidden px-8 pb-14 pt-14 lg:grid-cols-5 lg:gap-8 lg:px-12 lg:pt-20"
    >
      {/* Decorative leaf/branch silhouette, low-opacity background detail */}
      <svg
        aria-hidden
        viewBox="0 0 300 300"
        className="pointer-events-none absolute -left-16 -top-16 h-[340px] w-[340px] text-ink/[0.05]"
      >
        <path
          fill="currentColor"
          d="M150 10c40 30 90 55 100 120 8 55-25 110-85 130-15 5-20-8-10-18 45-40 55-90 40-135-10-30-30-55-55-75-8-6-2-27 10-22Z"
        />
        <path
          fill="currentColor"
          d="M40 60c50-5 100 15 120 60 18 42 5 90-30 118-10 8-22-2-16-14 25-45 25-85 5-118-18-30-48-45-82-45-14 0-11-20 3-21Z"
        />
      </svg>

      {/* Left column */}
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative z-10 max-w-xl lg:col-span-2"
      >
        <h1 className="text-5xl font-bold leading-[1.08] tracking-tightest text-ink lg:text-[3.4rem]">
          {content.headingLines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>

        <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft/80">
          {content.subheading}
        </p>

        <MotionLink
          href="/join-as-a-brand"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          className="mt-9 inline-flex items-center gap-2.5 rounded-full bg-mahalyred px-7 py-4 text-[15px] font-semibold text-cream shadow-soft transition-shadow hover:shadow-card"
        >
          <Store className="h-4 w-4" strokeWidth={1.8} />
          {content.ctaLabel}
        </MotionLink>
      </motion.div>

      {/* Right column — 4 equal-size department tiles */}
      <div className="relative z-10 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:col-span-3 lg:gap-5">
        {TILE_ORDER.map((key, i) => {
          const tile = tiles[key];
          return (
            <MotionLink
              key={key}
              href={tile.href}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 * i, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ scale: 1.03, zIndex: 20 }}
              className="group relative block cursor-pointer overflow-hidden rounded-xl3 bg-stone-100 shadow-card transition-shadow duration-500 hover:shadow-cardHover"
              style={{ aspectRatio: "3 / 4.1" }}
            >
              <Image
                src={tile.image}
                alt={`${tile.label} collection`}
                fill
                sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 15vw"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                priority={i === 0}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/25 via-transparent to-transparent" />

              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-full bg-cream/95 px-3.5 py-2 shadow-soft backdrop-blur-sm">
                <span className="text-xs font-bold uppercase tracking-wide text-ink">
                  {tile.label}
                </span>
                <ArrowUpRight
                  className="h-3.5 w-3.5 text-ink transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  strokeWidth={2}
                />
              </div>
            </MotionLink>
          );
        })}
      </div>
    </section>
  );
}
