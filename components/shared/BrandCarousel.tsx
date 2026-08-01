"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// Auto-advancing crossfade over a list of sponsored-brand slides — shared
// by the homepage's end-of-page banner and the header's Brands mega menu
// promo, so both "become a carousel when more than one brand is
// sponsored for that spot" the same way. Purely handles timing/transition;
// each call site supplies its own visual markup via `children`, since the
// two spots look nothing alike.
export default function BrandCarousel<T extends { slug: string }>({
  slides,
  intervalMs = 5000,
  children,
}: {
  slides: T[];
  intervalMs?: number;
  children: (slide: T) => React.ReactNode;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), intervalMs);
    return () => clearInterval(timer);
  }, [slides.length, intervalMs]);

  if (slides.length === 0) return null;
  const current = slides[index % slides.length];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={current.slug}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="h-full w-full"
      >
        {children(current)}
      </motion.div>
    </AnimatePresence>
  );
}
