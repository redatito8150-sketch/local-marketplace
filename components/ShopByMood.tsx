"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, MotionConfig } from "framer-motion";
import type { MoodTileContent } from "@/types";

export default function ShopByMood({ tiles }: { tiles: MoodTileContent[] }) {
  if (!tiles.length) return null;
  return (
    <MotionConfig reducedMotion="never">
    <section className="mx-auto max-w-[1920px] border-b border-white/20 bg-cream/16 px-6 py-6 md:px-10 xl:px-16">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.7 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="mb-3"
      >
        <h2 className="font-serif text-[25px] font-semibold tracking-tight">Shop by mood</h2>
      </motion.div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {tiles.map((tile, index) => (
          <motion.div
            key={tile.id}
            initial={{ opacity: 0, y: 38, scale: 0.96 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ type: "spring", stiffness: 95, damping: 18, delay: index * 0.08 }}
          >
            <Link href={tile.href} className="group relative block h-[158px] overflow-hidden rounded-[8px] bg-stone-100">
              <Image src={tile.image} alt={tile.label} fill sizes="20vw" className="object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-black/5 to-transparent transition-opacity duration-500 group-hover:opacity-70" />
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
    </MotionConfig>
  );
}
