import { NextRequest, NextResponse } from "next/server";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateOptionValueLabel, validateColorValueInput } from "@/lib/admin/optionValidation";
import { normalizeOptionKey, deriveSkuToken } from "@/lib/inventory/optionKey";
import { checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/errorLog";

export async function POST(request: NextRequest) {
  const owner = await requireBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner || owner.isImpersonating || !owner.brandId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!checkRateLimit(`brand-option-value-create:${owner.user.id}`, 60, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const body = await request.json();
  const optionTypeId = typeof body.optionTypeId === "string" ? body.optionTypeId.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!optionTypeId) return NextResponse.json({ error: "An option type is required" }, { status: 400 });

  const labelError = validateOptionValueLabel(label);
  if (labelError) return NextResponse.json({ error: labelError }, { status: 400 });

  const colorError = validateColorValueInput(body);
  if (colorError) return NextResponse.json({ error: colorError }, { status: 400 });

  const { data: optionType } = await supabaseAdmin
    .from("option_types")
    .select("id, brand_id")
    .eq("id", optionTypeId)
    .maybeSingle();
  if (!optionType) return NextResponse.json({ error: "Option type not found" }, { status: 404 });
  if (optionType.brand_id && optionType.brand_id !== owner.brandId) {
    return NextResponse.json({ error: "This option type belongs to a different brand" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("option_values")
    .insert({
      option_type_id: optionTypeId,
      brand_id: owner.brandId,
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
    logError("brand-portal.product-options.values.create", error.message);
    return NextResponse.json({ error: "Failed to create option value" }, { status: 500 });
  }

  return NextResponse.json({
    id: data.id,
    optionTypeId,
    brandId: owner.brandId,
    label: data.label,
    key: data.key,
    skuToken: data.sku_token,
    sortOrder: data.sort_order,
    swatchType: data.swatch_type ?? undefined,
    primaryColor: data.primary_color ?? undefined,
    secondaryColor: data.secondary_color ?? undefined,
  });
}
