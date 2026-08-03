import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
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
  const { data: brand, error: brandError } = await supabaseAdmin
    .from("brands")
    .select("id, owner_user_id")
    .eq("slug", params.slug)
    .maybeSingle();
  if (brandError) return safeErrorResponse("admin.brands.owners.lookup", brandError, "Failed to load");
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { data: staffRows, error: staffError } = await supabaseAdmin
    .from("brand_staff")
    .select("user_id, access_level")
    .eq("brand_id", brand.id);
  if (staffError) return safeErrorResponse("admin.brands.owners.staff", staffError, "Failed to load");

  const ownerIds = new Set<string>();
  const assistantIds = new Set<string>();
  if (brand.owner_user_id) ownerIds.add(brand.owner_user_id);
  for (const row of staffRows ?? []) {
    if (row.access_level === "owner") ownerIds.add(row.user_id);
    else assistantIds.add(row.user_id);
  }

  const allIds = [...new Set([...ownerIds, ...assistantIds])];
  const { data: profiles, error: profilesError } = allIds.length
    ? await supabaseAdmin.from("profiles").select("id, email, full_name").in("id", allIds)
    : { data: [], error: null };
  if (profilesError) return safeErrorResponse("admin.brands.owners.profiles", profilesError, "Failed to load");

  const byId = new Map((profiles ?? []).map((row) => [row.id as string, row]));
  const describe = (id: string) => {
    const profile = byId.get(id);
    return { id, email: profile?.email ?? null, name: profile?.full_name ?? null };
  };

  return NextResponse.json({
    owners: [...ownerIds].map(describe),
    assistants: [...assistantIds].map(describe),
  });
}
