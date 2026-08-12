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
  brands: { is_active: boolean; fulfillment_mode: string } | null;
  image: string;
  first_stocked_at: string | null;
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
  // Carried through into payment_attempts.cart_snapshot and, from there,
  // into order_items.image once place_paid_order() runs — without this, a
  // card-paid order's items always had an empty image (place_paid_order
  // used to insert '' unconditionally), which is exactly the broken
  // <img src=""> a "shipped" email (lib/email/templates/orderShipped.ts,
  // via lib/email/templates/shared.ts's orderItemsTable) then rendered.
  image: string;
  // Point-in-time pricing snapshot — same fields app/api/orders/route.ts
  // (COD) already sends into place_order()'s p_items, now carried the same
  // way through cart_snapshot so place_paid_order() can write them onto
  // order_items too. See getVariantEffectivePrice()'s `base`/`percent`/
  // `source` fields in lib/pricing.ts. Optional (not required by
  // computeIntentionAmount, which only needs price/quantity/currency/brand)
  // so existing fixtures/tests building a bare CartLineItem-shaped object
  // don't need every field — resolveIntentionCart always sets all four on
  // its real output.
  originalUnitPrice?: number;
  discountPercentSnapshot?: number | null;
  discountSource?: "product_discount" | "variant_discount" | "none";
  // This line's own share of the coupon discount, in EGP — filled in by
  // allocateCouponDiscount() below (0 until then, and always 0 when no
  // coupon was applied). Baked in at intention-creation time, since that's
  // the exact amount actually charged via Paymob — see this file's own
  // header comment on why place_paid_order() never recomputes this later.
  itemCouponDiscountEgp?: number;
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
    // Checkout defense in depth for the product-launch gate (item 4 of the
    // fulfillment-foundation corrective pass): a zakhnook_fulfilled brand's
    // product with no first_stocked_at yet is never purchasable, mirroring
    // storefront_products' own WHERE clause (supabase/migrations/
    // 20260814000006_storefront_launch_gate_view.sql) — this lookup can't
    // source from that view directly (it needs the brands!...!inner embed
    // the view can't expose), so the same condition is checked explicitly.
    const isLaunched = product?.brands?.fulfillment_mode !== "zakhnook_fulfilled" || product?.first_stocked_at != null;
    if (
      !product ||
      product.status !== "published" ||
      product.paused_by_brand ||
      !isPublishDateLive(product.publish_date, now) ||
      !product.brands?.is_active ||
      !isLaunched
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

    const effective = getVariantEffectivePrice(
      Number(product.price),
      variant.variantPrice,
      product.discount_percent,
      product.discount_ends_at,
      variant.variantDiscountPercent,
      now
    );

    lineItems.push({
      productId: product.id,
      variantId: variant.id,
      name: product.name,
      brand: product.brand_name,
      brandSlug: product.brand_slug ?? "",
      price: effective.price,
      currency: product.currency,
      size: item.size,
      color: item.color ?? "",
      quantity: item.quantity,
      image: product.image,
      originalUnitPrice: effective.base,
      discountPercentSnapshot: effective.source === "none" ? null : (effective.percent ?? null),
      discountSource: effective.source,
      itemCouponDiscountEgp: 0,
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
    image: line.image,
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

export interface CouponForIntention {
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
}

export interface CouponAllocationResult {
  lineItems: ResolvedIntentionLine[];
  totalDiscountEgp: number;
}

// Mirrors private.place_order()'s Pass 2/3 discount split exactly (round to
// the piaster, proportional by EGP subtotal share, the LAST bucket/item in
// iteration order absorbs the rounding remainder) so the two paths can never
// diverge in how a shared coupon is allocated. This is computed once, here,
// at intention-creation time — the amount actually sent to Paymob is derived
// from this result, so place_paid_order() can later just record it rather
// than recompute it (see that function's own header comment for why
// recomputing at fulfillment time would risk a charge/record mismatch).
// coupon.discountValue is assumed already validated (active/not expired/
// under max_uses) by the caller — this function only does the math.
export function allocateCouponDiscount(
  lineItems: ResolvedIntentionLine[],
  partnerFlagsBySlug: Map<string, boolean>,
  coupon: CouponForIntention
): CouponAllocationResult {
  const bucketKeyOf = (line: ResolvedIntentionLine): string => {
    const isPartner = line.brandSlug ? (partnerFlagsBySlug.get(line.brandSlug) ?? false) : false;
    return isPartner || !line.brandSlug ? "__mahaly_pool__" : line.brandSlug;
  };

  const bucketKeys: string[] = [];
  for (const line of lineItems) {
    const key = bucketKeyOf(line);
    if (!bucketKeys.includes(key)) bucketKeys.push(key);
  }

  // All Paymob lines are already asserted EGP-only by the caller before
  // this runs (see createIntentionForCart.ts), so every line counts toward
  // the proportional base — unlike the COD path, there's no USD/EGP split
  // to filter here.
  const totalSubtotalEgp = lineItems.reduce((sum, line) => sum + line.price * line.quantity, 0);

  let totalDiscountEgp: number;
  if (coupon.discountType === "percentage") {
    totalDiscountEgp = Math.round(totalSubtotalEgp * (coupon.discountValue / 100) * 100) / 100;
  } else {
    totalDiscountEgp = Math.min(coupon.discountValue, totalSubtotalEgp);
  }

  if (totalDiscountEgp <= 0 || totalSubtotalEgp <= 0) {
    return { lineItems: lineItems.map((line) => ({ ...line, itemCouponDiscountEgp: 0 })), totalDiscountEgp: 0 };
  }

  const result: ResolvedIntentionLine[] = [...lineItems];
  let discountAssigned = 0;

  bucketKeys.forEach((bucketKey, bucketIndex) => {
    const bucketIndices = result
      .map((line, i) => (bucketKeyOf(line) === bucketKey ? i : -1))
      .filter((i) => i !== -1);
    const bucketSubtotalEgp = bucketIndices.reduce((sum, i) => sum + result[i].price * result[i].quantity, 0);

    let bucketDiscount: number;
    if (bucketIndex === bucketKeys.length - 1) {
      bucketDiscount = Math.round((totalDiscountEgp - discountAssigned) * 100) / 100;
    } else if (totalSubtotalEgp > 0) {
      bucketDiscount = Math.round(totalDiscountEgp * (bucketSubtotalEgp / totalSubtotalEgp) * 100) / 100;
    } else {
      bucketDiscount = 0;
    }
    discountAssigned = Math.round((discountAssigned + bucketDiscount) * 100) / 100;

    let bucketAssigned = 0;
    bucketIndices.forEach((lineIndex, itemIndexInBucket) => {
      const line = result[lineIndex];
      let itemDiscount: number;
      if (itemIndexInBucket === bucketIndices.length - 1) {
        itemDiscount = Math.round((bucketDiscount - bucketAssigned) * 100) / 100;
      } else if (bucketSubtotalEgp > 0) {
        itemDiscount = Math.round(bucketDiscount * ((line.price * line.quantity) / bucketSubtotalEgp) * 100) / 100;
      } else {
        itemDiscount = 0;
      }
      bucketAssigned = Math.round((bucketAssigned + itemDiscount) * 100) / 100;
      result[lineIndex] = { ...line, itemCouponDiscountEgp: itemDiscount };
    });
  });

  return { lineItems: result, totalDiscountEgp };
}
