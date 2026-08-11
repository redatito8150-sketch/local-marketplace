// Server-side pricing/availability resolution for a Paymob payment
// intention. Deliberately mirrors the same checks app/api/orders/route.ts
// runs before calling place_order (product availability, variant
// resolution, effective price, stock) — reusing the exact same primitives
// (isPublishDateLive, isVariantPurchasable, getVariantEffectivePrice) so
// the amount charged here can never drift from what an actual order would
// charge. This file never imports Supabase — the caller fetches products/
// variants and passes plain data in, which is what makes it unit-testable
// with fixtures instead of a live database.

import { isPublishDateLive } from "../newArrivals.ts";
import { isVariantPurchasable } from "../inventory/stockStatus.ts";
import { getVariantEffectivePrice } from "../pricing.ts";
import { groupItemsByFulfillment, shipmentShippingFee } from "../cart/fulfillmentGroups.ts";
import { egpToAmountCents } from "./paymob.ts";
import type { ValidatedOrderItem } from "../orders/orderRequest.ts";
import type { CartLineItem, ProductVariant, ShippingSettingsContent } from "../../types/index.ts";

export interface ProductLookupRow {
  id: string;
  name: string;
  brand_name: string;
  brand_slug: string | null;
  price: number | string;
  discount_percent: number | null;
  discount_ends_at: string | null;
  currency: "USD" | "EGP";
  status: string;
  publish_date: string | null;
  paused_by_brand: boolean;
  brands: { is_active: boolean } | null;
}

export interface ResolvedIntentionLine {
  productId: string;
  variantId: string;
  name: string;
  brand: string;
  brandSlug: string;
  price: number;
  currency: "USD" | "EGP";
  size: string;
  color: string;
  quantity: number;
}

export type ResolveCartResult =
  | { ok: true; lineItems: ResolvedIntentionLine[] }
  | { ok: false; status: 400 | 409; error: string };

export function resolveIntentionCart(
  items: ValidatedOrderItem[],
  productById: Map<string, ProductLookupRow>,
  variantsByProduct: Map<string, ProductVariant[]>,
  now: Date = new Date()
): ResolveCartResult {
  for (const item of items) {
    const product = productById.get(item.productId);
    if (
      !product ||
      product.status !== "published" ||
      product.paused_by_brand ||
      !isPublishDateLive(product.publish_date, now) ||
      !product.brands?.is_active
    ) {
      return { ok: false, status: 400, error: "An item in your cart is no longer available" };
    }
  }

  const normalizeOption = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";
  const lineItems: ResolvedIntentionLine[] = [];

  for (const item of items) {
    const product = productById.get(item.productId)!;
    const productVariants = variantsByProduct.get(item.productId) ?? [];
    const variant = productVariants.find((candidate) => {
      const color = candidate.optionValues.find((o) => o.optionTypeName === "Color")?.label;
      const size = candidate.optionValues.find((o) => o.optionTypeName === "Size")?.label;
      return (
        normalizeOption(color) === normalizeOption(item.color) &&
        normalizeOption(size) === normalizeOption(item.size)
      );
    });

    if (!variant) {
      return { ok: false, status: 400, error: `${product.name} no longer offers the selected options.` };
    }
    if (!isVariantPurchasable(variant)) {
      return { ok: false, status: 400, error: `${product.name} no longer offers the selected options.` };
    }
    if (variant.quantity < item.quantity) {
      return {
        ok: false,
        status: 409,
        error: `${product.name} no longer has enough stock — please update your cart.`,
      };
    }

    lineItems.push({
      productId: product.id,
      variantId: variant.id,
      name: product.name,
      brand: product.brand_name,
      brandSlug: product.brand_slug ?? "",
      price: getVariantEffectivePrice(
        Number(product.price),
        variant.variantPrice,
        product.discount_percent,
        product.discount_ends_at,
        variant.variantDiscountPercent,
        now
      ).price,
      currency: product.currency,
      size: item.size,
      color: item.color ?? "",
      quantity: item.quantity,
    });
  }

  return { ok: true, lineItems };
}

// One bucket = one eventual order/shipment (the Zakhnook-partner pool, or
// one independent brand) — see lib/cart/fulfillmentGroups.ts. This is the
// single authoritative shape for "how much of the charge belongs to this
// bucket": private.payment_attempt_fulfillments.expected_amount_cents (see
// that column's comment in the payment_attempts migration) will eventually
// be populated straight from this, unchanged.
export interface BucketExpectedAmount {
  bucketKey: string;
  brandSlug: string | null;
  subtotalEgp: number;
  shippingFeeEgp: number;
  // egpToAmountCents(subtotalEgp + shippingFeeEgp) for THIS bucket alone —
  // a bucket's own discount allocation is added into this figure only once
  // coupon support exists for this endpoint; there is none to allocate today.
  amountCents: number;
}

export interface IntentionAmount {
  subtotalEgp: number;
  shippingFeeEgp: number;
  totalEgp: number;
  // The authoritative amount to charge, in piasters. Deliberately computed
  // as the SUM of each bucket's own already-rounded amountCents below,
  // never as an independent rounding of the grand total — that's what
  // makes "sum(bucket expected_amount_cents) reconciles with the Payment
  // Attempt amount" true by construction rather than merely by coincidence
  // of rounding. See tests/paymobIntentionCart.test.ts for the invariant
  // this guarantees.
  totalAmountCents: number;
  buckets: BucketExpectedAmount[];
}

// Delivery fee uses the exact same per-shipment grouping (Zakhnook-partner
// pool vs. one shipment per independent brand) as the checkout page preview
// and, authoritatively, the place_order() Postgres function — see
// lib/cart/fulfillmentGroups.ts.
export function computeIntentionAmount(
  lineItems: ResolvedIntentionLine[],
  partnerFlagsBySlug: Map<string, boolean>,
  shippingSettings: ShippingSettingsContent
): IntentionAmount {
  const cartLineItems: CartLineItem[] = lineItems.map((line) => ({
    id: `${line.productId}-${line.size}-${line.color}`,
    productId: line.productId,
    variantId: line.variantId,
    name: line.name,
    brand: line.brand,
    brandSlug: line.brandSlug,
    price: line.price,
    currency: line.currency,
    image: "",
    size: line.size,
    color: line.color || undefined,
    quantity: line.quantity,
  }));

  const groups = groupItemsByFulfillment(cartLineItems, partnerFlagsBySlug);
  const buckets: BucketExpectedAmount[] = groups.map((group) => {
    const bucketSubtotalEgp = group.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const bucketShippingFeeEgp = shipmentShippingFee(
      group,
      shippingSettings.flatDeliveryFeeEgp,
      shippingSettings.freeShippingThresholdEgp
    );
    return {
      bucketKey: group.key,
      brandSlug: group.isPool ? null : group.brandSlug,
      subtotalEgp: bucketSubtotalEgp,
      shippingFeeEgp: bucketShippingFeeEgp,
      amountCents: egpToAmountCents(bucketSubtotalEgp + bucketShippingFeeEgp),
    };
  });

  const subtotalEgp = buckets.reduce((sum, bucket) => sum + bucket.subtotalEgp, 0);
  const shippingFeeEgp = buckets.reduce((sum, bucket) => sum + bucket.shippingFeeEgp, 0);
  const totalAmountCents = buckets.reduce((sum, bucket) => sum + bucket.amountCents, 0);

  return { subtotalEgp, shippingFeeEgp, totalEgp: subtotalEgp + shippingFeeEgp, totalAmountCents, buckets };
}
