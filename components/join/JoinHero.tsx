"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import ApplyBrandCTA from "./ApplyBrandCTA";
import { JOIN_HERO } from "@/content/join";
import type { JoinHeroContent } from "@/types";

export default function JoinHero({ content }: { content: JoinHeroContent }) {
  const reduceMotion = useReducedMotion();

  return (
    <section className="w-full bg-ink">
      <div className="grid grid-cols-1 lg:h-[560px] lg:grid-cols-[1fr_1.3fr_1fr]">
        {/* Left collage — hidden below `lg` rather than crushed to fit */}
        <div className="hidden grid-rows-2 gap-3 lg:grid">
          {JOIN_HERO.images.left.map((img) => (
            <div key={img.src} className="relative overflow-hidden">
              <Image
                src={img.src}
                alt={img.alt}
                fill
                sizes="20vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>

        {/* Center content */}
        <motion.div
          initial={reduceMotion ? undefined : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="flex flex-col items-center justify-center px-8 py-16 text-center lg:px-14 lg:py-0"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-cream/60">
            {content.label}
          </span>
          <h1 className="mt-5 font-serif text-4xl font-semibold leading-[1.15] text-cream lg:text-[2.75rem]">
            {content.headingLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </h1>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-cream/70">
            {content.subheading}
          </p>
          <ApplyBrandCTA label={content.ctaLabel} variant="light" className="mt-8" />
        </motion.div>

        {/* Right collage */}
        <div className="hidden grid-cols-2 gap-3 lg:grid">
          <div className="relative col-span-2 overflow-hidden">
            <Image
              src={JOIN_HERO.images.right[0].src}
              alt={JOIN_HERO.images.right[0].alt}
              fill
              sizes="27vw"
              className="object-cover"
            />
          </div>
          <div className="relative overflow-hidden">
            <Image
              src={JOIN_HERO.images.right[1].src}
              alt={JOIN_HERO.images.right[1].alt}
              fill
              sizes="13vw"
              className="object-cover"
            />
          </div>
          <div className="relative overflow-hidden">
            <Image
              src={JOIN_HERO.images.right[2].src}
              alt={JOIN_HERO.images.right[2].alt}
              fill
              sizes="13vw"
              className="object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
