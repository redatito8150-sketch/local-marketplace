import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Every system option type/value (brand_id null) plus the given brand's
// own private ones — never another brand's. Used to populate the Variant
// Options picker in the admin product form.
export async function GET(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const brandId = request.nextUrl.searchParams.get("brandId");
  if (!brandId) {
    return NextResponse.json({ error: "A brandId query param is required" }, { status: 400 });
  }

  const [{ data: types, error: typesError }, { data: values, error: valuesError }] = await Promise.all([
    supabaseAdmin
      .from("option_types")
      .select("id, brand_id, name, key, is_system, sort_order")
      .or(`brand_id.is.null,brand_id.eq.${brandId}`)
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("option_values")
      .select("id, option_type_id, brand_id, label, key, sku_token, sort_order, swatch_type, primary_color, secondary_color")
      .or(`brand_id.is.null,brand_id.eq.${brandId}`)
      .order("sort_order", { ascending: true }),
  ]);

  if (typesError || valuesError) {
    return NextResponse.json(
      { error: `Failed to load options: ${typesError?.message ?? valuesError?.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    optionTypes: (types ?? []).map((t) => ({
      id: t.id,
      brandId: t.brand_id ?? undefined,
      name: t.name,
      key: t.key,
      isSystem: t.is_system,
      sortOrder: t.sort_order,
    })),
    optionValues: (values ?? []).map((v) => ({
      id: v.id,
      optionTypeId: v.option_type_id,
      brandId: v.brand_id ?? undefined,
      label: v.label,
      key: v.key,
      skuToken: v.sku_token,
      sortOrder: v.sort_order,
      swatchType: v.swatch_type ?? undefined,
      primaryColor: v.primary_color ?? undefined,
      secondaryColor: v.secondary_color ?? undefined,
    })),
  });
}
