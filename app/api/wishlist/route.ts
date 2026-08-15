import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getWishlistForUser } from "@/lib/data/wishlist";
import { safeErrorResponse } from "@/lib/apiError";
import { getRequestUser } from "@/lib/supabase/requestUser";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const items = await getWishlistForUser(user.id);
  return NextResponse.json({ items });
}

// Toggles a single product on/off the caller's own wishlist — the request
// body only needs productId; display fields (name/brand/price/image) are
// joined from `products` at read time, never duplicated into this table.
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { productId } = await request.json();
  if (!productId || typeof productId !== "string") {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("wishlists")
    .select("id")
    .eq("user_id", user.id)
    .eq("product_id", productId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabaseAdmin.from("wishlists").delete().eq("id", existing.id);
    if (error) {
      return safeErrorResponse("wishlist.remove", error);
    }
    return NextResponse.json({ wishlisted: false });
  }

  // CORRECTIVE PASS: a wishlisted product must currently be customer-visible
  // (unpublished/archived/paused/future-scheduled/inactive-brand/an
  // unreached when_stocked gate all excluded; show_now at 0 stock is still
  // visible, so it's still wishlistable). Checked here for a clean 404
  // instead of a raw 500 from the DB trigger below, which is the real
  // enforcement boundary (wishlists_enforce_visibility, supabase/migrations/
  // 20260815000000_product_launch_policy_and_opening_stock.sql) and stays
  // authoritative even if this check is ever bypassed or drifts.
  const { data: visible } = await supabaseAdmin.rpc("is_product_customer_visible", {
    p_product_id: productId,
  });
  if (!visible) {
    return NextResponse.json({ error: "This product isn't currently available to customers." }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("wishlists")
    .insert({ user_id: user.id, product_id: productId });
  if (error) {
    if (error.message.includes("PRODUCT_NOT_AVAILABLE_FOR_WISHLIST")) {
      return NextResponse.json({ error: "This product isn't currently available to customers." }, { status: 404 });
    }
    return safeErrorResponse("wishlist.add", error);
  }
  return NextResponse.json({ wishlisted: true });
}

// Explicit removal (not a toggle) — used by the account wishlist page's
// "remove" action, where the caller always means "take this off," never
// "add it if it's somehow missing."
export async function DELETE(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("wishlists")
    .delete()
    .eq("user_id", user.id)
    .eq("product_id", productId);
  if (error) {
    return safeErrorResponse("wishlist.delete", error);
  }
  return NextResponse.json({ wishlisted: false });
}
