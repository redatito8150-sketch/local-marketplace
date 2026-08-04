import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { getAllProductsForAdmin } from "@/lib/data/admin";
import { safeErrorResponse } from "@/lib/apiError";

// Lightweight catalog list backing admin product-picker widgets (e.g.
// components/admin/MoodProductPicker.tsx) — every published product's
// id/name/image/brand, fetched once and filtered client-side, same
// precedent as CollectionProductPicker's per-brand product list.
export async function GET(_request: NextRequest) {
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  try {
    const products = await getAllProductsForAdmin();
    return NextResponse.json({
      products: products
        .filter((product) => product.status === "published")
        .map((product) => ({
          id: product.id,
          name: product.name,
          image: product.image,
          brandName: product.brandName,
        })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return safeErrorResponse("admin.products.picker", { message }, "Failed to load products");
  }
}
