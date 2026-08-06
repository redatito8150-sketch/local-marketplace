import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/requestUser";
import { subscribeToRestock } from "@/lib/backInStock";
import { checkRateLimit } from "@/lib/rateLimit";

// Subscribes the caller to a "back in stock" alert for one specific
// variant of this product (the exact Color+Size they wanted, not the
// whole product — see lib/backInStock.ts). Authenticated only: the alert
// is delivered by email + an account notification, so there has to be an
// account to deliver it to.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in to get notified" }, { status: 403 });
  }
  if (!user.email) {
    return NextResponse.json({ error: "Your account has no email on file" }, { status: 400 });
  }

  if (!checkRateLimit(`back-in-stock-subscribe:${user.id}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const variantId = typeof body?.variantId === "string" ? body.variantId : null;
  if (!variantId) {
    return NextResponse.json({ error: "Missing variantId" }, { status: 400 });
  }

  const result = await subscribeToRestock(user.id, user.email, params.id, variantId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ subscribed: true });
}
