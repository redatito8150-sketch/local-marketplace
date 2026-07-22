import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { sendEmail } from "@/lib/email/sendEmail";
import { orderConfirmationEmail } from "@/lib/email/templates/orderConfirmation";
import { getOrderForAdmin } from "@/lib/data/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { logError } from "@/lib/errorLog";
import { MAX_ORDER_BODY_BYTES, validateOrderRequest } from "@/lib/orders/orderRequest";

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

export async function POST(request: NextRequest) {
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
  const { items, shipping, couponCode } = validation.value;

  // Re-fetch prices/details/variants from the DB rather than trusting
  // client-submitted values — the client only sends product id +
  // size/color/quantity, never a price or variant id we'd act on directly.
  const productIds = [...new Set(items.map((i) => i.productId))];
  const [
    { data: products, error: productsError },
    { data: variantRows, error: variantsError },
  ] = await Promise.all([
    supabaseAdmin
      .from("products")
      .select("id, name, brand_name, brand_slug, price, currency, image, sizes, unavailable_sizes, status, paused_by_brand, in_stock, track_inventory")
      .in("id", productIds),
    supabaseAdmin
      .from("product_variants")
      .select("id, product_id, color, size, price_override, quantity, availability_status")
      .in("product_id", productIds),
  ]);

  if (productsError) {
    logError("Order product lookup failed", productsError.message);
    return NextResponse.json(
      { error: "We couldn't validate your cart. Please try again." },
      { status: 500 }
    );
  }
  if (variantsError) {
    logError("Order variant lookup failed", variantsError.message);
    return NextResponse.json(
      { error: "We couldn't validate your cart. Please try again." },
      { status: 500 }
    );
  }

  const productById = new Map((products ?? []).map((p) => [p.id, p]));

  for (const item of items) {
    const product = productById.get(item.productId);
    if (
      !product ||
      product.status !== "published" ||
      product.paused_by_brand ||
      !product.in_stock
    ) {
      return NextResponse.json(
        { error: "An item in your cart is no longer available" },
        { status: 400 }
      );
    }
    // Legacy per-size flag — still enforced for any product not yet using
    // variants; place_order does the precise per-variant stock check below.
    if (product.unavailable_sizes?.includes(item.size)) {
      return NextResponse.json(
        { error: `Size ${item.size} is currently unavailable for ${product.name}` },
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
      const productVariants = (variantRows ?? []).filter(
        (variant) => variant.product_id === item.productId
      );
      const normalizeOption = (value: string | null | undefined) =>
        value?.trim().toLowerCase() ?? "";
      const variant = productVariants.find(
        (candidate) =>
          normalizeOption(candidate.color) === normalizeOption(item.color) &&
          normalizeOption(candidate.size) === normalizeOption(item.size)
      );

      if (productVariants.length > 0 && !variant) {
        throw new Error(`INVALID_VARIANT:${product.name}`);
      }
      if (variant && variant.availability_status !== "available") {
        throw new Error(`UNAVAILABLE_VARIANT:${product.name}`);
      }
      if (product.track_inventory && productVariants.length === 0) {
        throw new Error(`MISSING_INVENTORY_VARIANT:${product.name}`);
      }
      if (product.track_inventory && variant && variant.quantity < item.quantity) {
        throw new Error(`INSUFFICIENT_STOCK:${product.name}`);
      }
      if (
        productVariants.length === 0 &&
        product.sizes?.length &&
        !product.sizes.includes(item.size)
      ) {
        throw new Error(`INVALID_VARIANT:${product.name}`);
      }

      return {
        product_id: product.id,
        variant_id: variant?.id ?? "",
        name: product.name,
        brand: product.brand_name,
        brand_slug: product.brand_slug ?? "",
        price: variant?.price_override ?? Number(product.price),
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
        : code === "MISSING_INVENTORY_VARIANT"
          ? `${productName} is temporarily unavailable while its inventory is updated.`
          : `${productName} no longer offers the selected options.`;
    return NextResponse.json({ error: publicMessage }, { status });
  }

  // Look up the signed-in user (if any) via the cookie-backed server client;
  // guest checkout stays supported with a null user_id.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // One RPC call does the whole checkout atomically: unique order number,
  // order row, per-variant stock check + decrement, and order_items — all
  // in a single transaction, so two concurrent purchases of the last unit
  // can't both succeed and a multi-item order can't half-complete.
  const { data: result, error: placeOrderError } = await supabaseAdmin.rpc("place_order", {
    p_shipping_name: `${shipping.firstName} ${shipping.lastName}`.trim(),
    p_shipping_email: shipping.email,
    p_shipping_phone: shipping.phone,
    p_shipping_address: shipping.address,
    p_shipping_city: shipping.city,
    p_shipping_governorate: shipping.governorate,
    p_user_id: user?.id ?? null,
    p_items: rpcItems,
    p_coupon_code: couponCode?.trim() || null,
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
    logError("Order placement failed", message || "Unknown database error");
    return NextResponse.json(
      { error: "We couldn't place your order. Please try again." },
      { status: 500 }
    );
  }

  await notify(
    "order_created",
    `New order ${result?.order_number}`,
    `${items.length} item${items.length === 1 ? "" : "s"}`,
    {
      entityId: result?.order_number,
      entityIdLabel: "Order ID",
      actorLabel: `${shipping.firstName} ${shipping.lastName} (${shipping.email})`,
      detailLabel: "Items",
    }
  );

  if (result?.order_id) {
    const order = await getOrderForAdmin(result.order_id);
    if (order) {
      await sendEmail({ to: shipping.email, ...orderConfirmationEmail(order) });
    }
  }

  // Check the variants this order actually touched for anything that just
  // crossed into low stock, now that place_order has committed the decrement.
  const touchedVariantIds = rpcItems.map((i) => i.variant_id).filter(Boolean);
  if (touchedVariantIds.length > 0) {
    const { data: lowStockVariants } = await supabaseAdmin
      .from("product_variants")
      .select("id, product_id, color, size, quantity, low_stock_threshold")
      .in("id", touchedVariantIds);

    for (const variant of lowStockVariants ?? []) {
      if (variant.quantity <= variant.low_stock_threshold) {
        const product = productById.get(variant.product_id);
        const combo = [variant.color, variant.size].filter(Boolean).join(" / ") || "default";
        await notify(
          "low_stock",
          `Low stock: ${product?.name ?? variant.product_id}`,
          `${combo} — ${variant.quantity} left`,
          { entityId: variant.product_id, entityIdLabel: "Product ID" }
        );
      }
    }
  }

  return NextResponse.json({ orderNumber: result?.order_number });
}
