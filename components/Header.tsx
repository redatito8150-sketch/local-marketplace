"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Heart, ShoppingBag, User, Menu, X, LayoutGrid } from "lucide-react";
import BrandsMegaMenu from "@/components/navigation/BrandsMegaMenu";
import DiscoverMenu from "@/components/navigation/DiscoverMenu";
import SearchAutocomplete from "@/components/navigation/SearchAutocomplete";
import Logo from "@/components/shared/Logo";
import { DISCOVER_LINKS } from "@/content/navigation";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";

const NAV_LINKS = [
  { label: "Home", href: "/#home" },
  { label: "Deals", href: "#deals" },
  { label: "About", href: "#about" },
];

// Same entries as the desktop nav, but "Brands"/"Discover" are plain links
// here instead of the hover-driven mega/dropdown menus, which don't
// translate to a phone screen.
const MOBILE_NAV_LINKS = [
  { label: "Home", href: "/#home" },
  { label: "Brands", href: "/brands" },
  ...DISCOVER_LINKS.map(({ label, href }) => ({ label, href })),
  { label: "Deals", href: "#deals" },
  { label: "About", href: "#about" },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("Home");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const { itemCount } = useCart();
  const { count: wishlistCount } = useWishlist();
  const { user, profile } = useAuth();
  // "Dashboard" only ever needs to point at one place per account — an
  // admin always outranks a brand link even if (rare, admin-only) an
  // account somehow carries both, since /admin already has full access to
  // every brand's portal from there.
  const dashboardHref = profile?.isAdmin
    ? "/admin"
    : profile?.role === "brand_owner" || profile?.role === "brand_assistant"
      ? "/brand-portal"
      : null;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Escape and click-outside close the mobile menu, same as BrandsMegaMenu.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [mobileMenuOpen]);

  return (
    <motion.header
      ref={mobileMenuRef}
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`sticky top-0 z-50 border-b border-stone-150/70 transition-all duration-300 ${
        scrolled
          ? "bg-cream/90 backdrop-blur-md shadow-soft"
          : "bg-cream/60 backdrop-blur-sm"
      }`}
    >
      <div className="mx-auto flex h-[84px] max-w-[1920px] items-center justify-between gap-4 px-4 sm:px-6 md:px-10 xl:px-12">
        {/* Logo */}
        <Logo />

        {/* Center nav */}
        <nav className="hidden items-center gap-10 xl:flex">
          {NAV_LINKS.slice(0, 1).map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setActive(link.label)}
              className="group relative text-[15px] font-medium text-ink-soft transition-colors hover:text-ink"
            >
              {link.label}
              <span
                className={`absolute -bottom-1 left-0 h-px bg-mahalyred transition-all duration-300 ${
                  active === link.label ? "w-full" : "w-0 group-hover:w-full"
                }`}
              />
            </Link>
          ))}

          <BrandsMegaMenu />
          <DiscoverMenu />

          {NAV_LINKS.slice(1).map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setActive(link.label)}
              className="group relative text-[15px] font-medium text-ink-soft transition-colors hover:text-ink"
            >
              {link.label}
              <span
                className={`absolute -bottom-1 left-0 h-px bg-mahalyred transition-all duration-300 ${
                  active === link.label ? "w-full" : "w-0 group-hover:w-full"
                }`}
              />
            </Link>
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2 sm:gap-4">
          <SearchAutocomplete />

          {dashboardHref && (
            <Link
              href={dashboardHref}
              aria-label="Dashboard"
              title="Dashboard"
              className="relative rounded-full p-2 text-ink transition-colors hover:bg-stone-100"
            >
              <LayoutGrid className="h-5 w-5" strokeWidth={1.6} />
            </Link>
          )}

          <Link
            href="/account"
            aria-label="Account"
            className="relative rounded-full p-2 text-ink transition-colors hover:bg-stone-100"
          >
            <User className="h-5 w-5" strokeWidth={1.6} />
            {user && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-ink ring-2 ring-cream" />
            )}
          </Link>

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

          <button
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="rounded-full p-2 text-ink transition-colors hover:bg-stone-100 xl:hidden"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" strokeWidth={1.6} />
            ) : (
              <Menu className="h-5 w-5" strokeWidth={1.6} />
            )}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <nav className="border-t border-stone-150 xl:hidden">
          <ul className="flex flex-col px-8 py-2">
            {MOBILE_NAV_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block py-3 text-[15px] font-medium text-ink-soft transition-colors hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </motion.header>
  );
}
