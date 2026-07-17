"use client";

import Image from "next/image";
import { useRef } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";

const BOARDS = [
  {
    title: "Summer Style",
    img: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=600&q=80",
  },
  {
    title: "Minimal Living",
    img: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=600&q=80",
  },
  {
    title: "Streetwear",
    img: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=600&q=80",
  },
  {
    title: "Travel Essentials",
    img: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&q=80",
  },
  {
    title: "Home Decor",
    img: "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=600&q=80",
  },
  {
    title: "Beauty Picks",
    img: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600&q=80",
  },
  {
    title: "Accessories",
    img: "https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=600&q=80",
  },
  {
    title: "Shoes Collection",
    img: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600&q=80",
  },
  {
    title: "Modern Lifestyle",
    img: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600&q=80",
  },
];

export default function ExploreBoards() {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -420 : 420, behavior: "smooth" });
  };

  return (
    <section id="brands" className="mx-auto max-w-screen2xl px-8 py-20 lg:px-12">
      <div className="mb-10 flex items-end justify-between">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl font-bold tracking-tightest text-ink">
            Explore boards
          </h2>
          <p className="mt-2 text-base text-ink-soft/70">
            Find inspiration for any moment
          </p>
        </motion.div>

        <div className="hidden items-center gap-2 lg:flex">
          <button
            aria-label="Scroll left"
            onClick={() => scroll("left")}
            className="rounded-full border border-stone-150 p-2.5 text-ink transition-colors hover:bg-stone-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            aria-label="Scroll right"
            onClick={() => scroll("right")}
            className="rounded-full border border-stone-150 p-2.5 text-ink transition-colors hover:bg-stone-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="no-scrollbar flex gap-5 overflow-x-auto scroll-smooth pb-2"
      >
        {BOARDS.map((board, i) => (
          <motion.a
            href="#"
            key={board.title}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: i * 0.05 }}
            whileHover={{ y: -6 }}
            className="group relative w-[220px] flex-none overflow-hidden rounded-xl2 bg-stone-100 shadow-soft transition-shadow duration-500 hover:shadow-card"
            style={{ aspectRatio: "3 / 4.4" }}
          >
            <Image
              src={board.img}
              alt={board.title}
              fill
              sizes="220px"
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/50 via-ink/0 to-transparent" />
            <span className="absolute bottom-4 left-4 right-4 text-base font-semibold text-cream">
              {board.title}
            </span>
          </motion.a>
        ))}

        <a
          href="#"
          className="group flex w-[140px] flex-none flex-col items-center justify-center gap-3 rounded-xl2 border border-dashed border-stone-150 text-ink-soft/70 transition-colors hover:border-ink/40 hover:text-ink"
          style={{ aspectRatio: "3 / 4.4" }}
        >
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          <span className="text-sm font-medium">See all</span>
        </a>
      </div>
    </section>
  );
}
