import type { CartLineItem } from "@/types";

// Mirrors the bucketing rule inside the place_order() Postgres function
// (supabase/migrations/20260807000001_brand_partner_fulfillment_and_order_splitting.sql):
// every Mahaly-partner brand's items pool into one shared shipment; a
// missing brand attribution also falls into that pool as the delivery
// fallback of last resort; every distinct non-partner brand gets its own
// shipment. This is display-only — used to preview the cart/checkout split
// before checkout — the server-side split in place_order is authoritative.
export const MAHALY_POOL_KEY = "__mahaly_pool__";

export interface FulfillmentGroup {
  key: string;
  isPool: boolean;
  brandSlug: string | null;
  brandNames: string[];
  items: CartLineItem[];
  subtotalUsd: number;
  subtotalEgp: number;
}

export function groupItemsByFulfillment(
  items: CartLineItem[],
  partnerFlagsBySlug: Map<string, boolean>
): FulfillmentGroup[] {
  const groups = new Map<string, FulfillmentGroup>();

  for (const item of items) {
    const isPartner = item.brandSlug ? partnerFlagsBySlug.get(item.brandSlug) ?? false : false;
    const key = isPartner || !item.brandSlug ? MAHALY_POOL_KEY : item.brandSlug;

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        isPool: key === MAHALY_POOL_KEY,
        brandSlug: key === MAHALY_POOL_KEY ? null : key,
        brandNames: [],
        items: [],
        subtotalUsd: 0,
        subtotalEgp: 0,
      };
      groups.set(key, group);
    }
    group.items.push(item);
    if (!group.brandNames.includes(item.brand)) group.brandNames.push(item.brand);
    const lineTotal = item.price * item.quantity;
    if (item.currency === "EGP") group.subtotalEgp += lineTotal;
    else group.subtotalUsd += lineTotal;
  }

  // Pool group first (if present), then independent brands alphabetically.
  return [...groups.values()].sort((a, b) => {
    if (a.isPool !== b.isPool) return a.isPool ? -1 : 1;
    return a.brandNames.join(",").localeCompare(b.brandNames.join(","));
  });
}

export function shipmentShippingFee(
  group: FulfillmentGroup,
  flatFeeEgp: number,
  freeShippingThresholdEgp: number
): number {
  if (group.subtotalEgp >= freeShippingThresholdEgp) return 0;
  return flatFeeEgp;
}
