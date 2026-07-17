import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateProductInput, type ProductInput } from "@/lib/admin/productValidation";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body: ProductInput = await request.json();
  const validationError = validateProductInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const baseSlug = slugify(body.name) || "product";
  let id = "";
  let inserted = false;

  for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
    id = `${baseSlug}-${randomSuffix()}`;
    const { error } = await supabaseAdmin.from("products").insert({
      id,
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
      sku: body.sku?.trim() || id,
      in_stock: body.inStock,
      is_new: body.isNew,
      is_unisex: body.isUnisex,
      unavailable_sizes: body.unavailableSizes,
    });

    if (!error) {
      inserted = true;
    } else if (error.code !== "23505" /* unique_violation */) {
      return NextResponse.json(
        { error: `Failed to create product: ${error.message}` },
        { status: 500 }
      );
    }
  }

  if (!inserted) {
    return NextResponse.json(
      { error: "Failed to generate a unique product id, please try again" },
      { status: 500 }
    );
  }

  return NextResponse.json({ id });
}
