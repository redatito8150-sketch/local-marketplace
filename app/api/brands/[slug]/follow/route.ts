import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/requestUser";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";

// Toggles the caller's own follow row for this brand — no request body
// needed, the current state is read straight from the table rather than
// trusted from the client.
export async function POST(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in to follow a brand" }, { status: 403 });
  }

  const { data: existing } = await supabaseAdmin
    .from("brand_follows")
    .select("id")
    .eq("user_id", user.id)
    .eq("brand_slug", params.slug)
    .maybeSingle();

  if (existing) {
    const { error } = await supabaseAdmin.from("brand_follows").delete().eq("id", existing.id);
    if (error) {
      return safeErrorResponse("brands.follow.remove", error);
    }
    return NextResponse.json({ following: false });
  }

  const { error } = await supabaseAdmin
    .from("brand_follows")
    .insert({ user_id: user.id, brand_slug: params.slug });

  if (error) {
    return safeErrorResponse("brands.follow.add", error);
  }
  return NextResponse.json({ following: true });
}
