"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown } from "lucide-react";
import {
  FEATURED_BRANDS,
  STYLE_CATEGORIES,
  BRANDS_PROMO,
  VIEW_ALL_BRANDS_HREF,
  VIEW_ALL_STYLES_HREF,
} from "@/content/navigation";

const CLOSE_DELAY = 150;

export default function BrandsMegaMenu() {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const openMenu = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
  };

  // Escape closes the menu regardless of where focus is inside it
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Click outside closes the menu
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => () => clearCloseTimer(), []);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
    >
      <Link
        href={VIEW_ALL_BRANDS_HREF}
        aria-haspopup="true"
        aria-expanded={open}
        onFocus={openMenu}
        className="group relative flex items-center gap-1 text-[15px] font-medium text-ink-soft transition-colors hover:text-ink"
      >
        Brands
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={2}
        />
        <span
          className={`absolute -bottom-1 left-0 h-px bg-ink transition-all duration-300 ${
            open ? "w-full" : "w-0 group-hover:w-full"
          }`}
        />
      </Link>

      <AnimatePresence>
        {open && (
          <>
            {/* invisible hover bridge so the menu survives the gap while moving the cursor down */}
            <div
              aria-hidden
              className="absolute left-1/2 top-full h-4 w-[900px] -translate-x-1/2"
            />

            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="absolute left-1/2 top-[calc(100%+16px)] z-50 w-[900px] -translate-x-1/2 overflow-hidden rounded-2xl border border-stone-150 bg-white shadow-card"
            >
              <div className="grid grid-cols-[220px_1px_320px_1px_1fr]">
                {/* Column 1 — Featured Brands */}
                <div className="p-7">
                  <p className="mb-4 text-[11px] font-bold uppercase tracking-wide text-ink-soft/50">
                    Featured Brands
                  </p>
                  <ul className="space-y-3.5">
                    {FEATURED_BRANDS.map((brand) => (
                      <li key={brand.slug}>
                        <Link
                          href={`/brands/${brand.slug}`}
                          onClick={() => setOpen(false)}
                          className="group/item flex items-center gap-3"
                        >
                          <span className="relative h-9 w-9 flex-none overflow-hidden rounded-lg bg-stone-100">
                            <Image
                              src={brand.thumbnail}
                              alt={brand.name}
                              fill
                              sizes="36px"
                              className="object-cover transition-transform duration-500 group-hover/item:scale-110"
                            />
                          </span>
                          <span className="text-[13px] font-medium text-ink-soft transition-colors group-hover/item:text-ink">
                            {brand.name}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={VIEW_ALL_BRANDS_HREF}
                    onClick={() => setOpen(false)}
                    className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accentred transition-opacity hover:opacity-70"
                  >
                    View all brands
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                  </Link>
                </div>

                <div className="my-7 w-px bg-stone-150" />

                {/* Column 2 — Browse by Style */}
                <div className="p-7">
                  <p className="mb-4 text-[11px] font-bold uppercase tracking-wide text-ink-soft/50">
                    Browse by Style
                  </p>
                  <ul className="grid grid-cols-2 gap-x-5 gap-y-3.5">
                    {STYLE_CATEGORIES.map((style) => {
                      const Icon = style.icon;
                      return (
                        <li key={style.label}>
                          <Link
                            href={style.href}
                            onClick={() => setOpen(false)}
                            className="group/item flex items-center gap-2.5"
                          >
                            <Icon
                              className="h-4 w-4 flex-none text-ink-soft/60 transition-colors group-hover/item:text-ink"
                              strokeWidth={1.6}
                            />
                            <span className="text-[13px] font-medium text-ink-soft transition-colors group-hover/item:text-ink">
                              {style.label}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>

                  <Link
                    href={VIEW_ALL_STYLES_HREF}
                    onClick={() => setOpen(false)}
                    className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accentred transition-opacity hover:opacity-70"
                  >
                    View all styles
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                  </Link>
                </div>

                <div className="my-7 w-px bg-stone-150" />

                {/* Column 3 — Promo card */}
                <div className="p-5">
                  <Link
                    href={BRANDS_PROMO.ctaHref}
                    onClick={() => setOpen(false)}
                    className="group/promo relative block h-full min-h-[300px] overflow-hidden rounded-xl2"
                  >
                    <Image
                      src={BRANDS_PROMO.image}
                      alt="Discover local Egyptian brands"
                      fill
                      sizes="320px"
                      className="object-cover transition-transform duration-700 ease-out group-hover/promo:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />

                    <div className="relative flex h-full flex-col justify-end p-6">
                      <h3 className="text-2xl font-bold leading-tight text-white">
                        {BRANDS_PROMO.heading.map((line) => (
                          <span key={line} className="block">
                            {line}
                          </span>
                        ))}
                      </h3>
                      <p className="mt-2 text-[13px] text-white/80">
                        {BRANDS_PROMO.subheading}
                      </p>
                      <span className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-navy px-4 py-2.5 text-[13px] font-semibold text-white transition-transform group-hover/promo:translate-x-0.5">
                        {BRANDS_PROMO.ctaLabel}
                        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                      </span>
                    </div>
                  </Link>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
