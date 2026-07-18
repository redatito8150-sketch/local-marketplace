"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { DISCOVER_LINKS } from "@/content/navigation";

const CLOSE_DELAY = 150;

// Same hover/open/close behavior as BrandsMegaMenu, scaled down to a
// single-column dropdown since this only ever holds a handful of links.
export default function DiscoverMenu() {
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

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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
        href={DISCOVER_LINKS[0].href}
        aria-haspopup="true"
        aria-expanded={open}
        onFocus={openMenu}
        className="group relative flex items-center gap-1 text-[15px] font-medium text-ink-soft transition-colors hover:text-ink"
      >
        Discover
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
              className="absolute left-1/2 top-full h-4 w-[240px] -translate-x-1/2"
            />

            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="absolute left-1/2 top-[calc(100%+16px)] z-50 w-[240px] -translate-x-1/2 overflow-hidden rounded-2xl border border-stone-150 bg-white p-2.5 shadow-card"
            >
              <ul>
                {DISCOVER_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-xl px-3.5 py-2.5 transition-colors hover:bg-stone-50"
                    >
                      <span className="block text-[13.5px] font-semibold text-ink">
                        {link.label}
                      </span>
                      <span className="block text-[12px] text-ink-soft/55">
                        {link.description}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
