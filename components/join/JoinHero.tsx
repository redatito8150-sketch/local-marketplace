"use client";

import Image from "next/image";
import { motion, MotionConfig } from "framer-motion";
import ApplyBrandCTA from "./ApplyBrandCTA";
import { JOIN_HERO } from "@/content/join";
import type { JoinHeroContent } from "@/types";

export default function JoinHero({ content }: { content: JoinHeroContent }) {
  return (
    <MotionConfig reducedMotion="never">
    <section className="px-5 py-8 md:px-10 lg:py-10 xl:px-12">
      <div className="mx-auto grid max-w-[1500px] grid-cols-1 overflow-hidden rounded-[42px] border border-white/50 bg-[#241b17]/92 shadow-[0_35px_100px_rgba(52,31,20,.3)] ring-1 ring-[#ead7c3]/20 lg:h-[570px] lg:grid-cols-[.88fr_1.28fr_.88fr]">
        {/* Left collage — hidden below `lg` rather than crushed to fit */}
        <div className="hidden grid-cols-2 gap-[3px] bg-[#b79a80] lg:grid">
          {JOIN_HERO.images.left.map((img, index) => (
            <div key={img.src} className="group relative overflow-hidden">
              <Image
                src={img.src}
                alt={img.alt}
                fill
                sizes="10vw"
                className={`object-cover transition-transform duration-[1800ms] ease-out group-hover:scale-[1.03] ${
                  index === 0 ? "object-[52%_50%]" : "object-[50%_48%]"
                }`}
              />
              <span className="absolute inset-0 bg-gradient-to-t from-[#2b1912]/35 via-transparent to-[#ead7c3]/10" />
            </div>
          ))}
        </div>

        {/* Center content */}
        <motion.div
          initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="relative flex flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_18%,rgba(197,74,57,.4),transparent_34%),radial-gradient(circle_at_50%_115%,rgba(205,172,137,.18),transparent_44%),linear-gradient(180deg,rgba(255,247,237,.06),transparent)] px-8 py-16 text-center lg:px-14 lg:py-0"
        >
          <span className="absolute left-1/2 top-12 h-24 w-24 -translate-x-1/2 rounded-full border border-cream/10" aria-hidden />
          <span className="absolute left-1/2 top-16 h-16 w-16 -translate-x-1/2 rounded-full border border-cream/10" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-cream/60">
            {content.label}
          </span>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-[-0.045em] text-cream lg:text-[3.1rem]">
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
        <div className="hidden grid-cols-2 gap-[3px] bg-[#b79a80] lg:grid">
          {JOIN_HERO.images.right.map((img, index) => (
            <div key={img.src} className="group relative overflow-hidden">
              <Image
                src={img.src}
                alt={img.alt}
                fill
                sizes="10vw"
                className={`object-cover transition-transform duration-[1800ms] ease-out group-hover:scale-[1.03] ${
                  index === 0 ? "object-[52%_50%]" : "object-[50%_50%]"
                }`}
              />
              <span className="absolute inset-0 bg-gradient-to-t from-[#2b1912]/35 via-transparent to-[#ead7c3]/10" />
            </div>
          ))}
        </div>
      </div>
    </section>
    </MotionConfig>
  );
}
