"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import type { MoodTileContent } from "@/types";

export default function ShopByMood({ tiles }: { tiles: MoodTileContent[] }) {
  if (tiles.length === 0) return null;

  return (
    <section className="mx-auto max-w-screen2xl px-8 py-20 lg:px-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="mb-10"
      >
        <h2 className="text-4xl font-bold tracking-tightest text-ink">Shop by Mood</h2>
        <p className="mt-2 text-base text-ink-soft/70">Find inspiration for any moment</p>
      </motion.div>

      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile, i) => (
          <motion.div
            key={tile.id}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: i * 0.05 }}
          >
            <Link
              href={tile.href}
              className="group relative block w-full overflow-hidden rounded-xl2 bg-stone-100 shadow-soft transition-shadow duration-500 hover:shadow-card"
              style={{ aspectRatio: "3 / 4.4" }}
            >
              <Image
                src={tile.image}
                alt={tile.label}
                fill
                sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 19vw"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/50 via-ink/0 to-transparent" />
              <span className="absolute bottom-4 left-4 right-4 text-base font-semibold text-cream">
                {tile.label}
              </span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
