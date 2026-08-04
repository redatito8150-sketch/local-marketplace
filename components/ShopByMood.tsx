"use client";

import { useState } from "react";
import { motion, MotionConfig } from "framer-motion";
import { X } from "lucide-react";
import type { ResolvedMoodTile } from "@/types";
import CollectionCoverCarousel from "@/components/brand/CollectionCoverCarousel";
import CompactProductCard from "@/components/shared/CompactProductCard";

export default function ShopByMood({ tiles }: { tiles: ResolvedMoodTile[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  if (!tiles.length) return null;
  const active = tiles.find((tile) => tile.id === activeId) ?? null;

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
            <button
              type="button"
              onClick={() => setActiveId((current) => (current === tile.id ? null : tile.id))}
              aria-expanded={activeId === tile.id}
              className={`group relative block h-[158px] w-full overflow-hidden rounded-[8px] bg-stone-100 text-left transition-shadow ${
                activeId === tile.id ? "ring-2 ring-mahalyred ring-offset-2" : ""
              }`}
            >
              <CollectionCoverCarousel
                images={tile.images}
                alt={tile.label}
                sizes="20vw"
                fillClassName="absolute inset-0 transition-transform duration-700 group-hover:scale-105"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent transition-opacity duration-500 group-hover:opacity-80" />
              <span className="pointer-events-none absolute bottom-3 left-3 right-3 text-[13px] font-semibold text-white drop-shadow">
                {tile.label}
              </span>
            </button>
          </motion.div>
        ))}
      </div>

      {active && (
        <motion.div
          key={active.id}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 rounded-[14px] border border-stone-200 bg-white/70 p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-serif text-xl text-ink">{active.label}</h3>
            <button
              type="button"
              onClick={() => setActiveId(null)}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-150 text-ink hover:bg-stone-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {active.products.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {active.products.map((product) => (
                <CompactProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-[13px] text-ink-soft/60">No products in this mood yet.</p>
          )}
        </motion.div>
      )}
    </section>
    </MotionConfig>
  );
}
