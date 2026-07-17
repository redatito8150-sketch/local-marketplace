"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Heart, ShoppingBag } from "lucide-react";
import BrandsMegaMenu from "@/components/navigation/BrandsMegaMenu";
import SearchAutocomplete from "@/components/navigation/SearchAutocomplete";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";

const NAV_LINKS = [
  { label: "Home", href: "/#home" },
  { label: "New Arrivals", href: "#new-arrivals" },
  { label: "Deals", href: "#deals" },
  { label: "About", href: "#about" },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("Home");
  const { itemCount } = useCart();
  const { count: wishlistCount } = useWishlist();

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
          <SearchAutocomplete />

          <Link
            href="/wishlist"
            aria-label="Wishlist"
            className="relative rounded-full p-2 text-ink transition-colors hover:bg-stone-100"
          >
            <Heart className="h-5 w-5" strokeWidth={1.6} />
            {wishlistCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-cream">
                {wishlistCount}
              </span>
            )}
          </Link>

          <Link
            href="/cart"
            aria-label="Shopping bag"
            className="relative rounded-full p-2 text-ink transition-colors hover:bg-stone-100"
          >
            <ShoppingBag className="h-5 w-5" strokeWidth={1.6} />
            {itemCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-cream">
                {itemCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </motion.header>
  );
}
