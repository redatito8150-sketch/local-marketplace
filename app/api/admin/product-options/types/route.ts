import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateOptionTypeName } from "@/lib/admin/optionValidation";
import { normalizeOptionKey } from "@/lib/inventory/optionKey";
import { logError } from "@/lib/errorLog";

// Creates a brand-private custom option type (e.g. "Length"). Always
// scoped to the brandId in the body — an admin manages on behalf of a
// specific brand, never creates a global/system type through this route.
export async function POST(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!brandId) {
    return NextResponse.json({ error: "A brand is required" }, { status: 400 });
  }
  const validationError = validateOptionTypeName(name);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data: brand } = await supabaseAdmin.from("brands").select("id").eq("id", brandId).maybeSingle();
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("option_types")
    .insert({ brand_id: brandId, name, key: normalizeOptionKey(name), is_system: false })
    .select("id, name, key, is_system, sort_order")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: `"${name}" already exists for this brand` }, { status: 409 });
    }
    logError("admin.product-options.types.create", error.message);
    return NextResponse.json({ error: "Failed to create option type" }, { status: 500 });
  }

  return NextResponse.json({
    id: data.id,
    brandId,
    name: data.name,
    key: data.key,
    isSystem: data.is_system,
    sortOrder: data.sort_order,
  });
}
