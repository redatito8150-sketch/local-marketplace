import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getWishlistForUser } from "@/lib/data/wishlist";
import { safeErrorResponse } from "@/lib/apiError";

export async function GET() {
  const user = await requireUser();
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
  const user = await requireUser();
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

  const { error } = await supabaseAdmin
    .from("wishlists")
    .insert({ user_id: user.id, product_id: productId });
  if (error) {
    return safeErrorResponse("wishlist.add", error);
  }
  return NextResponse.json({ wishlisted: true });
}

// Explicit removal (not a toggle) — used by the account wishlist page's
// "remove" action, where the caller always means "take this off," never
// "add it if it's somehow missing."
export async function DELETE(request: NextRequest) {
  const user = await requireUser();
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
