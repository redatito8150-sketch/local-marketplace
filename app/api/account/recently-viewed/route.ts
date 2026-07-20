import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Silent no-op when signed out — this fires from every product page visit,
// and an anonymous browsing session has nothing to record against.
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ ok: true });
  }

  const { productId } = await request.json();
  if (!productId || typeof productId !== "string") {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("recently_viewed")
    .upsert(
      { user_id: user.id, product_id: productId, viewed_at: new Date().toISOString() },
      { onConflict: "user_id,product_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
