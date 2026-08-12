import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { getBrandMembersForAdmin } from "@/lib/data/admin";
import { safeErrorResponse } from "@/lib/apiError";

// Backs the "this brand already has an owner" warning in
// components/admin/UserAccessControl.tsx — checked before ever assigning
// Brand Owner in 'replace' mode (which would otherwise silently displace
// whoever's already there, the exact bug this whole feature exists to
// prevent). Returns every current owner (brands.owner_user_id *and* any
// brand_staff access_level='owner' co-owner rows, deduplicated) plus
// assistants, each with enough to show a human a name.
export async function GET(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const params = await props.params;
  try {
    const members = await getBrandMembersForAdmin(params.slug);
    if (!members) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    return NextResponse.json(members);
  } catch (error) {
    return safeErrorResponse("admin.brands.owners.lookup", error as { message: string }, "Failed to load");
  }
}
