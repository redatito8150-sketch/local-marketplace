"use client";

import { useEffect } from "react";

// The product page uses generateStaticParams + revalidate = 60 (ISR), so a
// server-side write during that render would only fire on cache
// regeneration, not on every real visit — this fires client-side on mount
// instead, once per page view.
export default function RecentlyViewedTracker({ productId }: { productId: string }) {
  useEffect(() => {
    fetch("/api/account/recently-viewed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    }).catch(() => {});
  }, [productId]);

  return null;
}
