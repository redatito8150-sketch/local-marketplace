"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Search, Heart, ShoppingBag } from "lucide-react";
import BrandsMegaMenu from "@/components/navigation/BrandsMegaMenu";

const NAV_LINKS = [
  { label: "Home", href: "/#home" },
  { label: "New Arrivals", href: "#new-arrivals" },
  { label: "Deals", href: "#deals" },
  { label: "About", href: "#about" },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("Home");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-cream/90 backdrop-blur-md shadow-soft"
          : "bg-cream/60 backdrop-blur-sm"
      }`}
    >
      <div className="mx-auto flex max-w-screen2xl items-center justify-between gap-8 px-8 py-5 lg:px-12">
        {/* Logo */}
        <Link
          href="/#home"
          className="text-2xl font-bold tracking-tightest text-ink"
        >
          Local
        </Link>

        {/* Center nav */}
        <nav className="hidden items-center gap-9 lg:flex">
          {NAV_LINKS.slice(0, 1).map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setActive(link.label)}
              className="group relative text-[15px] font-medium text-ink-soft transition-colors hover:text-ink"
            >
              {link.label}
              <span
                className={`absolute -bottom-1 left-0 h-px bg-ink transition-all duration-300 ${
                  active === link.label ? "w-full" : "w-0 group-hover:w-full"
                }`}
              />
            </Link>
          ))}

          <BrandsMegaMenu />

          {NAV_LINKS.slice(1).map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setActive(link.label)}
              className="group relative text-[15px] font-medium text-ink-soft transition-colors hover:text-ink"
            >
              {link.label}
              <span
                className={`absolute -bottom-1 left-0 h-px bg-ink transition-all duration-300 ${
                  active === link.label ? "w-full" : "w-0 group-hover:w-full"
                }`}
              />
            </Link>
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-4">
          <div className="relative hidden md:block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/60" />
            <input
              type="text"
              placeholder="Search for products, brands..."
              className="w-64 rounded-full border border-stone-150 bg-white/70 py-2.5 pl-11 pr-4 text-sm text-ink placeholder:text-ink-soft/50 outline-none transition-all focus:w-72 focus:border-ink/30 focus:bg-white"
            />
          </div>

          <button
            aria-label="Wishlist"
            className="rounded-full p-2 text-ink transition-colors hover:bg-stone-100"
          >
            <Heart className="h-5 w-5" strokeWidth={1.6} />
          </button>

          <button
            aria-label="Shopping bag"
            className="relative rounded-full p-2 text-ink transition-colors hover:bg-stone-100"
          >
            <ShoppingBag className="h-5 w-5" strokeWidth={1.6} />
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-cream">
              2
            </span>
          </button>
        </div>
      </div>
    </motion.header>
  );
}
