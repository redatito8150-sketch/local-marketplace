"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Heart, User, ShoppingBag, Menu, X } from "lucide-react";

const NAV_LINKS = [
  "Women",
  "Men",
  "Beauty",
  "Home",
  "Brands",
  "Discover",
  "Journal",
];

export default function BrandHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-white">
      <div className="mx-auto flex h-16 max-w-brand items-center justify-between px-6 lg:px-10">
        <Link
          href="/"
          className="text-[19px] font-semibold tracking-[0.02em] text-charcoal"
        >
          LOCAL
        </Link>

        <nav className="hidden items-center gap-10 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link}
              href="#"
              className="text-[13px] font-medium tracking-wide text-charcoal/70 transition-colors hover:text-charcoal"
            >
              {link}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <button
            aria-label="Search"
            className="hidden rounded-full p-2.5 text-charcoal/80 transition-colors hover:bg-stone-50 hover:text-charcoal focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy sm:inline-flex"
          >
            <Search className="h-[18px] w-[18px]" strokeWidth={1.5} />
          </button>
          <button
            aria-label="Wishlist"
            className="hidden rounded-full p-2.5 text-charcoal/80 transition-colors hover:bg-stone-50 hover:text-charcoal focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy sm:inline-flex"
          >
            <Heart className="h-[18px] w-[18px]" strokeWidth={1.5} />
          </button>
          <button
            aria-label="Account"
            className="hidden rounded-full p-2.5 text-charcoal/80 transition-colors hover:bg-stone-50 hover:text-charcoal focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy sm:inline-flex"
          >
            <User className="h-[18px] w-[18px]" strokeWidth={1.5} />
          </button>
          <button
            aria-label="Shopping bag"
            className="relative rounded-full p-2.5 text-charcoal/80 transition-colors hover:bg-stone-50 hover:text-charcoal focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy"
          >
            <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.5} />
          </button>

          <a
            href="#"
            className="ml-3 hidden rounded-full border border-charcoal/15 px-4 py-2 text-[12px] font-medium tracking-wide text-charcoal transition-colors hover:border-navy hover:text-navy lg:inline-flex"
          >
            Join as a Brand
          </a>

          <button
            aria-label="Open menu"
            onClick={() => setMobileOpen((o) => !o)}
            className="ml-1 rounded-full p-2.5 text-charcoal lg:hidden"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" strokeWidth={1.6} />
            ) : (
              <Menu className="h-5 w-5" strokeWidth={1.6} />
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-hairline bg-white px-6 py-5 lg:hidden">
          <nav className="flex flex-col gap-4">
            {NAV_LINKS.map((link) => (
              <a
                key={link}
                href="#"
                className="text-[15px] font-medium text-charcoal/80"
              >
                {link}
              </a>
            ))}
            <a href="#" className="mt-2 text-[15px] font-medium text-navy">
              Join as a Brand
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
