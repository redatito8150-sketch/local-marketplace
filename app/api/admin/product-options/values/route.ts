import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateOptionValueLabel, validateColorValueInput } from "@/lib/admin/optionValidation";
import { normalizeOptionKey, deriveSkuToken } from "@/lib/inventory/optionKey";
import { logError } from "@/lib/errorLog";
import { logAudit } from "@/lib/auditLog";

// Creates a brand-private custom value under any option type (a private
// custom Size like "Petite", a private custom Color, or a value under a
// brand's own private option type like "Length: Short"). Always scoped to
// the brandId in the body.
export async function POST(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  const optionTypeId = typeof body.optionTypeId === "string" ? body.optionTypeId.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!brandId) return NextResponse.json({ error: "A brand is required" }, { status: 400 });
  if (!optionTypeId) return NextResponse.json({ error: "An option type is required" }, { status: 400 });

  const labelError = validateOptionValueLabel(label);
  if (labelError) return NextResponse.json({ error: labelError }, { status: 400 });

  const colorError = validateColorValueInput(body);
  if (colorError) return NextResponse.json({ error: colorError }, { status: 400 });

  const { data: brand } = await supabaseAdmin.from("brands").select("id").eq("id", brandId).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { data: optionType } = await supabaseAdmin
    .from("option_types")
    .select("id, brand_id")
    .eq("id", optionTypeId)
    .maybeSingle();
  if (!optionType) return NextResponse.json({ error: "Option type not found" }, { status: 404 });
  if (optionType.brand_id && optionType.brand_id !== brandId) {
    return NextResponse.json({ error: "This option type belongs to a different brand" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("option_values")
    .insert({
      option_type_id: optionTypeId,
      brand_id: brandId,
      label,
      key: normalizeOptionKey(label),
      sku_token: deriveSkuToken(label),
      swatch_type: body.swatchType || null,
      primary_color: body.primaryColor || null,
      secondary_color: body.secondaryColor || null,
    })
    .select("id, label, key, sku_token, sort_order, swatch_type, primary_color, secondary_color")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: `"${label}" already exists for this option` }, { status: 409 });
    }
    logError("admin.product-options.values.create", error.message);
    return NextResponse.json({ error: "Failed to create option value" }, { status: 500 });
  }

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "option_value",
    entityId: data.id,
    action: "create",
    after: { label, brandId, optionTypeId },
  });

  return NextResponse.json({
    id: data.id,
    optionTypeId,
    brandId,
    label: data.label,
    key: data.key,
    skuToken: data.sku_token,
    sortOrder: data.sort_order,
    swatchType: data.swatch_type ?? undefined,
    primaryColor: data.primary_color ?? undefined,
    secondaryColor: data.secondary_color ?? undefined,
  });
}
