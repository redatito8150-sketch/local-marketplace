// Pure grouping logic extracted out of lib/orders/notifyBrandOwnersOfNewOrder.ts
// so it's unit-testable with plain fixtures, no Supabase/env dependency —
// same "pure logic in its own file, thin I/O wrapper around it" split
// already used by lib/cart/cartStorage.ts and lib/payments/intentionCart.ts.

import type { OrderItemRecord } from "../../types/index.ts";

export interface OrderItemRow {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  name: string;
  brand: string;
  brand_slug: string | null;
  price: number | string;
  currency: "USD" | "EGP";
  size: string;
  color: string | null;
  quantity: number;
  image: string;
}

// A pooled (mahaly_pool) order can hold several partner brands' items in
// the same orders row — this groups by each line's own order_items.
// brand_slug (never orders.brand_slug, which is null for the pool), so
// each brand only ever gets its own lines back, never a sibling partner's.
// A row with no brand_slug (legacy/unattributed) is dropped: there's no
// brand to notify, and no owner to send it to.
export function groupOrderItemsByBrandSlug(rows: OrderItemRow[]): Map<string, OrderItemRecord[]> {
  const itemsByBrandSlug = new Map<string, OrderItemRecord[]>();
  for (const row of rows) {
    if (!row.brand_slug) continue;
    const list = itemsByBrandSlug.get(row.brand_slug) ?? [];
    list.push({
      id: row.id,
      productId: row.product_id,
      variantId: row.variant_id ?? undefined,
      name: row.name,
      brand: row.brand,
      price: Number(row.price),
      currency: row.currency,
      size: row.size,
      color: row.color ?? undefined,
      quantity: row.quantity,
      image: row.image,
    });
    itemsByBrandSlug.set(row.brand_slug, list);
  }
  return itemsByBrandSlug;
}
