"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, MotionConfig } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import CompactProductCard from "@/components/shared/CompactProductCard";
import type { Product } from "@/types";

export default function NewArrivalsSection({ title, products, viewAllHref }: { title: string; products: Product[]; viewAllHref: string }) {
  const track = useRef<HTMLDivElement>(null);
  if (!products.length) return null;
  const move = (direction: number) => track.current?.scrollBy({ left: direction * Math.max(280, track.current.clientWidth * 0.72), behavior: "smooth" });
  return (
    <MotionConfig reducedMotion="never">
    <section className="mx-auto max-w-[1920px] border-t border-[#C85956]/10 bg-cream/20 px-6 py-9 md:px-10 xl:px-16">
      <motion.div initial={false} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.5 }} transition={{ duration: 0.55 }} className="mb-5 flex items-center justify-between">
        <h2 className="font-serif text-[25px] font-semibold tracking-tight text-ink">{title}</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => move(-1)} aria-label="Previous arrivals" className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-150 bg-white text-ink"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => move(1)} aria-label="Next arrivals" className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-150 bg-white text-ink"><ChevronRight className="h-4 w-4" /></button>
          <Link href={viewAllHref} className="ml-2 text-[11px] font-semibold text-mahalyred">View all</Link>
        </div>
      </motion.div>
      <div ref={track} className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto pb-5 pt-1">
        {products.map((product, index) => (
          <motion.div
            key={product.id}
            initial={false}
            whileInView={{ opacity: 1, x: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.22 }}
            transition={{ type: "spring", stiffness: 100, damping: 18, delay: Math.min(index, 5) * 0.08 }}
            className="w-[225px] shrink-0 snap-start sm:w-[245px] xl:w-[270px]"
          >
            <CompactProductCard product={product} />
          </motion.div>
        ))}
      </div>
    </section>
    </MotionConfig>
  );
}
