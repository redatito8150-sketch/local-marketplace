import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Toggles the caller's own follow row for this brand — no request body
// needed, the current state is read straight from the table rather than
// trusted from the client.
export async function POST(
  _request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const user = await requireUser();
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ following: false });
  }

  const { error } = await supabaseAdmin
    .from("brand_follows")
    .insert({ user_id: user.id, brand_slug: params.slug });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ following: true });
}
