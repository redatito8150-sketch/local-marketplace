import { NextRequest, NextResponse } from "next/server";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateOptionTypeName } from "@/lib/admin/optionValidation";
import { normalizeOptionKey } from "@/lib/inventory/optionKey";
import { checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/errorLog";
import { logAudit } from "@/lib/auditLog";

export async function POST(request: NextRequest) {
  const owner = await requireBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner || owner.isImpersonating || !owner.brandId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!checkRateLimit(`brand-option-type-create:${owner.user.id}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const validationError = validateOptionTypeName(name);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("option_types")
    .insert({ brand_id: owner.brandId, name, key: normalizeOptionKey(name), is_system: false })
    .select("id, name, key, is_system, sort_order")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: `"${name}" already exists for your brand` }, { status: 409 });
    }
    logError("brand-portal.product-options.types.create", error.message);
    return NextResponse.json({ error: "Failed to create option type" }, { status: 500 });
  }

  await logAudit({
    actorId: owner.user.id,
    actorLabel: owner.user.email ?? owner.user.id,
    entityType: "option_type",
    entityId: data.id,
    action: "create",
    after: { name },
    brandSlug: owner.brandSlug ?? undefined,
  });

  return NextResponse.json({
    id: data.id,
    brandId: owner.brandId,
    name: data.name,
    key: data.key,
    isSystem: data.is_system,
    sortOrder: data.sort_order,
  });
}
