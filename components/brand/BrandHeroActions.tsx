"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import FollowBrandButton from "@/components/brand/FollowBrandButton";

interface ViewerStatus {
  signedIn: boolean;
  isFollowing: boolean;
  isOwnBrand: boolean;
}

// Isolated client-side fetch for the only per-viewer part of an otherwise
// static/ISR brand page — see app/api/brands/[slug]/viewer-status/route.ts
// for why this can't just be resolved server-side in the page itself.
export default function BrandHeroActions({ brandSlug }: { brandSlug: string }) {
  const [status, setStatus] = useState<ViewerStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/brands/${brandSlug}/viewer-status`)
      .then((res) => res.json())
      .then((data: ViewerStatus) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus({ signedIn: false, isFollowing: false, isOwnBrand: false });
      });
    return () => {
      cancelled = true;
    };
  }, [brandSlug]);

  if (!status) {
    // Same footprint as the signed-out Follow button, invisible until the
    // real state resolves — avoids a layout shift/flash of the wrong state.
    return (
      <span
        aria-hidden
        className="rounded-full bg-white px-7 py-3 text-[13px] font-medium tracking-wide text-charcoal opacity-0"
      >
        Follow Brand
      </span>
    );
  }

  return (
    <>
      {status.isOwnBrand && (
        <Link
          href="/brand-portal"
          className="flex items-center gap-2 rounded-full bg-white px-7 py-3 text-[13px] font-semibold tracking-wide text-navy transition-transform hover:scale-[1.03]"
        >
          <LayoutDashboard className="h-4 w-4" strokeWidth={1.8} />
          Go to My Dashboard
        </Link>
      )}
      <FollowBrandButton
        brandSlug={brandSlug}
        initialFollowing={status.isFollowing}
        signedIn={status.signedIn}
      />
    </>
  );
}
