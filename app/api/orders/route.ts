import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

interface OrderItemInput {
  productId: string;
  size: string;
  color?: string;
  quantity: number;
}

interface ShippingInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  governorate: string;
}

interface OrderRequestBody {
  items: OrderItemInput[];
  shipping: ShippingInput;
}

function generateOrderNumber(): string {
  return `LC-${Math.floor(100000 + Math.random() * 900000)}`;
}

export async function POST(request: NextRequest) {
  let body: OrderRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { items, shipping } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  const requiredShippingFields: (keyof ShippingInput)[] = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "address",
    "city",
    "governorate",
  ];
  for (const field of requiredShippingFields) {
    if (!shipping?.[field]?.trim()) {
      return NextResponse.json(
        { error: `Missing shipping field: ${field}` },
        { status: 400 }
      );
    }
  }

  // Re-fetch prices/details from the DB rather than trusting client-submitted
  // values — the client only sends product id + size/color/quantity.
  const productIds = [...new Set(items.map((i) => i.productId))];
  const { data: products, error: productsError } = await supabaseAdmin
    .from("products")
    .select("id, name, brand_name, price, currency, image, in_stock, unavailable_sizes")
    .in("id", productIds);

  if (productsError) {
    return NextResponse.json(
      { error: `Failed to look up products: ${productsError.message}` },
      { status: 500 }
    );
  }

  const productById = new Map((products ?? []).map((p) => [p.id, p]));

  for (const item of items) {
    if (!productById.has(item.productId)) {
      return NextResponse.json(
        { error: `Product not found: ${item.productId}` },
        { status: 400 }
      );
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return NextResponse.json(
        { error: `Invalid quantity for product: ${item.productId}` },
        { status: 400 }
      );
    }
    const product = productById.get(item.productId)!;
    if (product.unavailable_sizes?.includes(item.size)) {
      return NextResponse.json(
        { error: `Size ${item.size} is currently unavailable for ${product.name}` },
        { status: 400 }
      );
    }
  }

  const subtotal = { usd: 0, egp: 0 };
  const orderItemRows = items.map((item) => {
    const product = productById.get(item.productId)!;
    const lineTotal = Number(product.price) * item.quantity;
    if (product.currency === "EGP") subtotal.egp += lineTotal;
    else subtotal.usd += lineTotal;

    return {
      product_id: product.id,
      name: product.name,
      brand: product.brand_name,
      price: product.price,
      currency: product.currency,
      size: item.size,
      color: item.color ?? null,
      quantity: item.quantity,
      image: product.image,
    };
  });

  // Look up the signed-in user (if any) via the cookie-backed server client;
  // guest checkout stays supported with a null user_id.
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let orderId: string | null = null;
  let orderNumber = "";

  // Order numbers are unique — retry once on the rare collision.
  for (let attempt = 0; attempt < 2 && !orderId; attempt++) {
    orderNumber = generateOrderNumber();
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        order_number: orderNumber,
        user_id: user?.id ?? null,
        shipping_name: `${shipping.firstName} ${shipping.lastName}`.trim(),
        shipping_email: shipping.email,
        shipping_phone: shipping.phone,
        shipping_address: shipping.address,
        shipping_city: shipping.city,
        shipping_governorate: shipping.governorate,
        subtotal_usd: subtotal.usd,
        subtotal_egp: subtotal.egp,
      })
      .select("id")
      .single();

    if (order) {
      orderId = order.id;
    } else if (orderError?.code !== "23505" /* unique_violation */) {
      return NextResponse.json(
        { error: `Failed to create order: ${orderError?.message}` },
        { status: 500 }
      );
    }
  }

  if (!orderId) {
    return NextResponse.json(
      { error: "Failed to generate a unique order number, please try again" },
      { status: 500 }
    );
  }

  const { error: itemsError } = await supabaseAdmin
    .from("order_items")
    .insert(orderItemRows.map((row) => ({ ...row, order_id: orderId })));

  if (itemsError) {
    return NextResponse.json(
      { error: `Failed to save order items: ${itemsError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ orderNumber });
}
