"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import CompactProductCard from "@/components/shared/CompactProductCard";
import type { Product } from "@/types";

export default function PageStudioProductGridSection({ title, products, viewAllHref }: { title: string; products: Product[]; viewAllHref: string }) {
  const reduceMotion = useReducedMotion();
  if (!products.length) return null;
  return (
    <section className="mx-auto max-w-[1920px] border-b border-white/20 bg-cream/58 px-6 py-9 backdrop-blur-[2px] md:px-10 xl:px-16">
      <motion.div initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.5 }} transition={{ duration: 0.55 }} className="mb-5 flex items-center justify-between gap-3">
        <h2 className="font-serif text-[25px] font-semibold tracking-tight text-ink">{title}</h2>
        <Link href={viewAllHref} className="text-[11px] font-semibold text-mahalyred">View all</Link>
      </motion.div>
      <div className="grid grid-cols-1 gap-5 min-[460px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {products.map((product, index) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, x: reduceMotion ? 0 : 75, y: reduceMotion ? 0 : 12, scale: reduceMotion ? 1 : 0.94 }}
            whileInView={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.18 }}
            transition={{ type: "spring", stiffness: 105, damping: 18, delay: reduceMotion ? 0 : Math.min(index, 5) * 0.08 }}
          >
            <CompactProductCard product={product} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}
