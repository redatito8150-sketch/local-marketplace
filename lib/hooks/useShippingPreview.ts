"use client";

import { useEffect, useState } from "react";
import { getBrandFulfillmentFlags } from "@/lib/data/brands";
import { getSiteContentWithFallback } from "@/lib/data/siteContent";
import { DEFAULT_SHIPPING_SETTINGS } from "@/content/settings";
import type { ShippingSettingsContent } from "@/types";

// Client-side preview only (cart/checkout pages) — mirrors, but never
// substitutes for, the authoritative split computed server-side inside the
// place_order() Postgres function at actual checkout time.
export function useShippingPreview(brandSlugs: string[]) {
  const [partnerFlagsBySlug, setPartnerFlagsBySlug] = useState<Map<string, boolean>>(new Map());
  const [shippingSettings, setShippingSettings] =
    useState<ShippingSettingsContent>(DEFAULT_SHIPPING_SETTINGS);
  const [loading, setLoading] = useState(true);

  const key = [...new Set(brandSlugs.filter(Boolean))].sort().join(",");

  useEffect(() => {
    let cancelled = false;
    const slugs = key ? key.split(",") : [];
    Promise.all([
      slugs.length > 0 ? getBrandFulfillmentFlags(slugs) : Promise.resolve([]),
      getSiteContentWithFallback<ShippingSettingsContent>("shipping_settings", DEFAULT_SHIPPING_SETTINGS),
    ])
      .then(([flags, settings]) => {
        if (cancelled) return;
        setPartnerFlagsBySlug(new Map(flags.map((f) => [f.slug, f.isMahalyPartner])));
        setShippingSettings(settings);
      })
      .catch(() => {
        if (!cancelled) setPartnerFlagsBySlug(new Map());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { partnerFlagsBySlug, shippingSettings, loading };
}
