import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateProductInput, type ProductInput } from "@/lib/admin/productValidation";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body: ProductInput = await request.json();
  const validationError = validateProductInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("products")
    .update({
      name: body.name,
      brand_name: body.brandName,
      brand_slug: body.brandSlug || null,
      category: body.category || null,
      price: body.price,
      currency: body.currency,
      image: body.image,
      images: body.images?.length ? body.images : [body.image],
      colors: body.colors,
      sizes: body.sizes,
      description: body.description,
      details: body.details,
      care_instructions: body.careInstructions,
      shipping_returns: body.shippingReturns,
      sku: body.sku?.trim() || params.id,
      in_stock: body.inStock,
      is_new: body.isNew,
      is_unisex: body.isUnisex,
      unavailable_sizes: body.unavailableSizes,
    })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json(
      { error: `Failed to update product: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: params.id });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from("products").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json(
      { error: `Failed to delete product: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
