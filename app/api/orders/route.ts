import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { sendEmail } from "@/lib/email/sendEmail";
import { orderConfirmationEmail } from "@/lib/email/templates/orderConfirmation";
import { getOrderForAdmin } from "@/lib/data/admin";
import { notifyBrandOwnersOfNewOrder } from "@/lib/orders/notifyBrandOwnersOfNewOrder";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { logError } from "@/lib/errorLog";
import { MAX_ORDER_BODY_BYTES, validateOrderRequest } from "@/lib/orders/orderRequest";
import { getRequestIdentity, getRequestUser } from "@/lib/supabase/requestUser";
import {
  buildOrderIdempotencyActor,
  hashOrderRequest,
  parseOrderIdempotencyKey,
} from "@/lib/orders/idempotency";
import { getOrdersForUser } from "@/lib/data/orders";
import { getVariantsForProducts } from "@/lib/data/variants";
import { isVariantPurchasable, calculateStockStatus, effectiveLowStockThreshold } from "@/lib/inventory/stockStatus";
import { getSiteContentWithFallback } from "@/lib/data/siteContent";
import { getVariantEffectivePrice } from "@/lib/pricing";
import { DEFAULT_SHIPPING_SETTINGS } from "@/content/settings";
import { isPublishDateLive } from "@/lib/newArrivals";
import type { ShippingSettingsContent } from "@/types";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const orders = await getOrdersForUser(user.id);
  return NextResponse.json({ orders });
}

interface RpcOrderItem {
  product_id: string;
  variant_id: string;
  name: string;
  brand: string;
  brand_slug: string;
  price: number;
  currency: string;
  size: string;
  color: string;
  quantity: number;
  image: string;
}

interface PlaceOrderResult {
  master_order_id: string;
  master_order_number: string;
  orders: { order_id: string; order_number: string }[];
  replayed?: boolean;
}

function orderApiResponse(result: PlaceOrderResult, replayed = false) {
  return {
    orderNumbers: result.orders.map((order) => order.order_number),
    masterOrderId: result.master_order_id,
    masterOrderNumber: result.master_order_number,
    ...(replayed || result.replayed ? { replayed: true } : {}),
  };
}

export async function POST(request: NextRequest) {
  const idempotencyKey = parseOrderIdempotencyKey(
    request.headers.get("idempotency-key")
  );
  if (!idempotencyKey) {
    return NextResponse.json(
      { error: "A valid Idempotency-Key header is required" },
      { status: 400 }
    );
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_ORDER_BODY_BYTES) {
    return NextResponse.json({ error: "Request is too large" }, { status: 413 });
  }
  if (!checkRateLimit(`order-create:${getClientIp(request)}`, 12, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many checkout attempts — try again shortly" }, { status: 429 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const validation = validateOrderRequest(rawBody);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const { items, shipping, couponCode, addressId } = validation.value;

  const identity = await getRequestIdentity(request);
  if (identity.status === "invalid_credentials") {
    return NextResponse.json(
      { error: "Your session has expired. Sign in again before placing the order." },
      { status: 401 }
    );
  }
  const user = identity.status === "authenticated" ? identity.user : null;
  const idempotencyActor = buildOrderIdempotencyActor(user?.id ?? null, shipping.email);
  const requestHash = hashOrderRequest(validation.value);

  const { data: replayedResult, error: replayLookupError } = await supabaseAdmin.rpc(
    "get_order_idempotency_result",
    {
      p_actor_key: idempotencyActor,
      p_idempotency_key: idempotencyKey,
      p_request_hash: requestHash,
    }
  );
  if (replayLookupError) {
    if (replayLookupError.message.startsWith("IDEMPOTENCY_CONFLICT")) {
      return NextResponse.json(
        { error: "This checkout key was already used with different order details." },
        { status: 409 }
      );
    }
    logError("Order idempotency lookup failed", replayLookupError.message);
    return NextResponse.json(
      { error: "We couldn't verify this checkout attempt. Please try again." },
      { status: 500 }
    );
  }
  if (replayedResult) {
    return NextResponse.json(
      orderApiResponse(replayedResult as PlaceOrderResult, true)
    );
  }

  // Re-fetch prices/details/variants from the DB rather than trusting
  // client-submitted values — the client only sends product id +
  // size/color/quantity, never a price or variant id we'd act on directly.
  const productIds = [...new Set(items.map((i) => i.productId))];
  const [{ data: products, error: productsError }, variantsByProduct] = await Promise.all([
    supabaseAdmin
      .from("products")
      .select("id, name, brand_name, brand_slug, brand_id, price, discount_percent, discount_ends_at, currency, image, status, publish_date, paused_by_brand, default_low_stock_threshold, brands!products_brand_slug_fkey!inner(is_active)")
      .in("id", productIds),
    getVariantsForProducts(productIds, supabaseAdmin).catch((error: Error) => {
      logError("Order variant lookup failed", error.message);
      return null;
    }),
  ]);

  if (productsError) {
    logError("Order product lookup failed", productsError.message);
    return NextResponse.json(
      { error: "We couldn't validate your cart. Please try again." },
      { status: 500 }
    );
  }
  if (variantsByProduct === null) {
    return NextResponse.json(
      { error: "We couldn't validate your cart. Please try again." },
      { status: 500 }
    );
  }

  const productById = new Map((products ?? []).map((p) => [p.id, p]));

  for (const item of items) {
    const product = productById.get(item.productId);
    const brand = product?.brands as unknown as { is_active: boolean } | null;
    if (
      !product ||
      product.status !== "published" ||
      product.paused_by_brand ||
      !isPublishDateLive(product.publish_date) ||
      !brand?.is_active
    ) {
      return NextResponse.json(
        { error: "An item in your cart is no longer available" },
        { status: 400 }
      );
    }
  }

  // Resolve each item to its real variant by product+color+size — never by
  // trusting a client-supplied variant id — so the price and stock check
  // place_order runs are both grounded in the DB, not the request body.
  let rpcItems: RpcOrderItem[];
  try {
    rpcItems = items.map((item) => {
      const product = productById.get(item.productId)!;
      const productVariants = variantsByProduct.get(item.productId) ?? [];
      const normalizeOption = (value: string | null | undefined) =>
        value?.trim().toLowerCase() ?? "";
      const variant = productVariants.find((candidate) => {
        const color = candidate.optionValues.find((o) => o.optionTypeName === "Color")?.label;
        const size = candidate.optionValues.find((o) => o.optionTypeName === "Size")?.label;
        return (
          normalizeOption(color) === normalizeOption(item.color) &&
          normalizeOption(size) === normalizeOption(item.size)
        );
      });

      if (!variant) {
        throw new Error(`INVALID_VARIANT:${product.name}`);
      }
      if (!isVariantPurchasable(variant)) {
        throw new Error(`UNAVAILABLE_VARIANT:${product.name}`);
      }
      if (variant.quantity < item.quantity) {
        throw new Error(`INSUFFICIENT_STOCK:${product.name}`);
      }

      return {
        product_id: product.id,
        variant_id: variant.id,
        name: product.name,
        brand: product.brand_name,
        brand_slug: product.brand_slug ?? "",
        // The real, live price at the moment of payment — if a discount
        // expired between add-to-cart and checkout, this correctly charges
        // the full base price, not whatever the cart displayed earlier. A
        // variant discount and the product's own discount are mutually
        // exclusive, so this picks whichever one actually applies.
        price: getVariantEffectivePrice(
          Number(product.price),
          variant.variantPrice,
          product.discount_percent,
          product.discount_ends_at,
          variant.variantDiscountPercent
        ).price,
        currency: product.currency,
        size: item.size,
        color: item.color ?? "",
        quantity: item.quantity,
        image: product.image,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "INVALID_VARIANT";
    const [code, productName = "An item"] = message.split(":", 2);
    const status = code === "INSUFFICIENT_STOCK" ? 409 : 400;
    const publicMessage =
      code === "INSUFFICIENT_STOCK"
        ? `${productName} no longer has enough stock — please update your cart.`
        : `${productName} no longer offers the selected options.`;
    return NextResponse.json({ error: publicMessage }, { status });
  }

  // A client-supplied addressId is only ever a traceability hint — never
  // trust it blindly. Confirm it actually belongs to the signed-in user
  // before passing it through, otherwise silently drop it (order still
  // places fine with the flat shipping snapshot alone).
  let verifiedAddressId: string | null = null;
  if (addressId && user) {
    const { data: ownedAddress } = await supabaseAdmin
      .from("addresses")
      .select("id")
      .eq("id", addressId)
      .eq("user_id", user.id)
      .maybeSingle();
    verifiedAddressId = ownedAddress?.id ?? null;
  }

  // Flat delivery fee + free-shipping threshold are admin-configurable
  // (site_content "shipping_settings") rather than hardcoded — resolved
  // server-side so the client can never influence the fee it's charged.
  const shippingSettings = await getSiteContentWithFallback<ShippingSettingsContent>(
    "shipping_settings",
    DEFAULT_SHIPPING_SETTINGS
  );

  // One RPC call does the whole checkout atomically: it fans out into one
  // order per fulfillment bucket (a single pooled order for every
  // Zakhnook-partner brand's items, plus one order per distinct independent
  // brand), each with its own unique order number, stock check/decrement,
  // and order_items — all in a single transaction, so two concurrent
  // purchases of the last unit can't both succeed and a multi-item order
  // can't half-complete.
  const { data: result, error: placeOrderError } = await supabaseAdmin.rpc("place_order", {
    p_shipping_name: `${shipping.firstName} ${shipping.lastName}`.trim(),
    p_shipping_email: shipping.email,
    p_shipping_phone: shipping.phone,
    p_shipping_address: shipping.address,
    p_shipping_city: shipping.city,
    p_shipping_governorate: shipping.governorate,
    p_user_id: user?.id ?? null,
    p_items: rpcItems,
    p_idempotency_key: idempotencyKey,
    p_idempotency_actor: idempotencyActor,
    p_request_hash: requestHash,
    p_coupon_code: couponCode?.trim() || null,
    p_address_id: verifiedAddressId,
    p_flat_shipping_fee_egp: shippingSettings.flatDeliveryFeeEgp,
    p_free_shipping_threshold_egp: shippingSettings.freeShippingThresholdEgp,
  });

  if (placeOrderError) {
    const message = placeOrderError.message ?? "";
    if (message.startsWith("INSUFFICIENT_STOCK")) {
      const productName = message.split(":")[1]?.trim() || "An item";
      return NextResponse.json(
        { error: `${productName} no longer has enough stock — please update your cart.` },
        { status: 409 }
      );
    }
    if (message.startsWith("COUPON_INVALID")) {
      return NextResponse.json(
        { error: message.split(":").slice(1).join(":").trim() || "This code isn't valid" },
        { status: 400 }
      );
    }
    if (message.startsWith("IDEMPOTENCY_CONFLICT")) {
      return NextResponse.json(
        { error: "This checkout key was already used with different order details." },
        { status: 409 }
      );
    }
    logError("Order placement failed", message || "Unknown database error");
    return NextResponse.json(
      { error: "We couldn't place your order. Please try again." },
      { status: 500 }
    );
  }

  const placeOrderResult = result as PlaceOrderResult | null;
  if (placeOrderResult?.replayed) {
    return NextResponse.json(orderApiResponse(placeOrderResult, true));
  }

  const createdOrders = placeOrderResult?.orders ?? [];

  await notify(
    "order_created",
    `New order group (${createdOrders.length} shipment${createdOrders.length === 1 ? "" : "s"})`,
    `${items.length} item${items.length === 1 ? "" : "s"} — ${createdOrders.map((o) => o.order_number).join(", ")}`,
    {
      // Links to the first shipment's real admin detail page — that page
      // itself shows every sibling shipment from the same checkout (see
      // getSiblingOrders), so one working link is enough to reach the
      // whole purchase. The old value here (order_number, "LC-XXXXXX")
      // could never resolve — /admin/orders/[id] looks up by the real
      // orders.id UUID, not the human-readable order number.
      relatedEntityType: "order",
      relatedEntityId: createdOrders[0]?.order_id,
      entityIdLabel: "Order ID",
      actorLabel: user ? `customer:${user.id}` : "guest customer",
      detailLabel: "Items",
    }
  );

  // One confirmation email per shipment — each is tracked/fulfilled
  // independently from here on, so each gets its own order number/email
  // rather than trying to cram a multi-shipment breakdown into one template.
  for (const created of createdOrders) {
    const order = await getOrderForAdmin(created.order_id);
    if (order) {
      await sendEmail({ to: shipping.email, ...orderConfirmationEmail(order) });
    }
    await notifyBrandOwnersOfNewOrder(created.order_id);
  }

  // Check the variants this order actually touched for anything that just
  // crossed into low stock, now that place_order has committed the decrement.
  const touchedVariantIds = rpcItems.map((i) => i.variant_id).filter(Boolean);
  if (touchedVariantIds.length > 0) {
    const { data: lowStockVariants } = await supabaseAdmin
      .from("product_variants")
      .select("id, product_id, quantity, low_stock_threshold_override")
      .in("id", touchedVariantIds);

    for (const variant of lowStockVariants ?? []) {
      const product = productById.get(variant.product_id);
      const threshold = effectiveLowStockThreshold(
        variant.low_stock_threshold_override,
        product?.default_low_stock_threshold ?? 5
      );
      if (calculateStockStatus(variant.quantity, threshold) !== "in_stock") {
        const touched = rpcItems.find((i) => i.variant_id === variant.id);
        const combo = [touched?.color, touched?.size].filter(Boolean).join(" / ") || "default";
        await notify(
          "low_stock",
          `Low stock: ${product?.name ?? variant.product_id}`,
          `${combo} — ${variant.quantity} left`,
          { entityId: variant.product_id, entityIdLabel: "Product ID" }
        );
      }
    }
  }

  return NextResponse.json(orderApiResponse(placeOrderResult!));
}
