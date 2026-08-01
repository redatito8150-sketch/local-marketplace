"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown } from "lucide-react";
import { BRANDS_PROMO, VIEW_ALL_BRANDS_HREF } from "@/content/navigation";
import type { MenuFeaturedBrand, SponsoredBrandSlide } from "@/lib/data/brands";
import BrandCarousel from "@/components/shared/BrandCarousel";
import PartnerBadge from "@/components/shared/PartnerBadge";

const CLOSE_DELAY = 150;

interface MenuData {
  featuredBrands: MenuFeaturedBrand[];
  megaMenuBanner: SponsoredBrandSlide[];
}

export default function BrandsMegaMenu() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<MenuData | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetched once on mount (not gated on `open`) so the first hover doesn't
  // have to wait on a network round-trip — /api/brands/menu-data is
  // edge-cached for a minute, so this is cheap even sitewide.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/brands/menu-data")
      .then((res) => res.json())
      .then((json: MenuData) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData({ featuredBrands: [], megaMenuBanner: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const featuredBrands = data?.featuredBrands ?? [];
  const megaMenuBanner = data?.megaMenuBanner ?? [];

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
              className="absolute left-1/2 top-full h-4 w-[620px] -translate-x-1/2"
            />

            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="absolute left-1/2 top-[calc(100%+16px)] z-50 w-[620px] -translate-x-1/2 overflow-hidden rounded-2xl border border-stone-150 bg-white shadow-card"
            >
              <div className="grid grid-cols-[220px_1px_1fr]">
                {/* Column 1 — Featured Brands (real, auto-ranked data) */}
                <div className="p-7">
                  <p className="mb-4 text-[11px] font-bold uppercase tracking-wide text-ink-soft/50">
                    Featured Brands
                  </p>
                  <ul className="space-y-3.5">
                    {featuredBrands.map((brand) => (
                      <li key={brand.slug}>
                        <Link
                          href={`/brands/${brand.slug}`}
                          onClick={() => setOpen(false)}
                          className="group/item flex items-center gap-3"
                        >
                          <span
                            className={`relative h-9 w-9 flex-none overflow-hidden rounded-lg bg-stone-100 ${
                              brand.isSponsored
                                ? "ring-2 ring-[#e9c477] ring-offset-2 ring-offset-white"
                                : ""
                            }`}
                          >
                            <Image
                              src={brand.thumbnail}
                              alt={brand.name}
                              fill
                              sizes="36px"
                              className="object-cover transition-transform duration-500 group-hover/item:scale-110"
                            />
                          </span>
                          <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink-soft transition-colors group-hover/item:text-ink">
                            {brand.name}
                            {brand.isMahalyPartner && <PartnerBadge className="h-3.5 w-3.5" />}
                            {brand.isNew && (
                              <span className="rounded-full bg-ink px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cream">
                                New
                              </span>
                            )}
                          </span>
                        </Link>
                      </li>
                    ))}
                    {featuredBrands.length === 0 && (
                      <li className="text-[12.5px] text-ink-soft/45">No brands yet.</li>
                    )}
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

                {/* Column 2 — promo card: real sponsor(s) when configured
                    (a carousel if more than one), else the static default */}
                <div className="p-5">
                  {megaMenuBanner.length > 0 ? (
                    <div className="relative h-full min-h-[300px] overflow-hidden rounded-xl2">
                      <BrandCarousel slides={megaMenuBanner}>
                        {(brand) => (
                          <Link
                            href={`/brands/${brand.slug}`}
                            onClick={() => setOpen(false)}
                            className="group/promo relative block h-full min-h-[300px] overflow-hidden rounded-xl2"
                          >
                            <Image
                              src={brand.heroImage}
                              alt={brand.name}
                              fill
                              sizes="380px"
                              className="object-cover transition-transform duration-700 ease-out group-hover/promo:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
                            <div className="relative flex h-full flex-col justify-end p-6">
                              <h3 className="flex items-center gap-2 text-2xl font-bold leading-tight text-white">
                                {brand.name}
                                {brand.isMahalyPartner && <PartnerBadge className="h-5 w-5" />}
                              </h3>
                              <p className="mt-2 line-clamp-2 text-[13px] text-white/80">
                                {brand.aboutDescription || brand.tagline}
                              </p>
                              <span className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-navy px-4 py-2.5 text-[13px] font-semibold text-white transition-transform group-hover/promo:translate-x-0.5">
                                Explore {brand.name}
                                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                              </span>
                            </div>
                          </Link>
                        )}
                      </BrandCarousel>
                    </div>
                  ) : (
                    <Link
                      href={BRANDS_PROMO.ctaHref}
                      onClick={() => setOpen(false)}
                      className="group/promo relative block h-full min-h-[300px] overflow-hidden rounded-xl2"
                    >
                      <Image
                        src={BRANDS_PROMO.image}
                        alt="Discover local Egyptian brands"
                        fill
                        sizes="380px"
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
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
