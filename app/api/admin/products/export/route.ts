import { NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { getAllProductsForAdmin } from "@/lib/data/admin";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const products = await getAllProductsForAdmin();

  const csv = toCsv(products, [
    { key: "id", label: "ID" },
    { key: "name", label: "Name" },
    { key: "brandName", label: "Brand" },
    { key: "category", label: "Gender" },
    { key: "productCategory", label: "Category" },
    { key: "price", label: "Price" },
    { key: "currency", label: "Currency" },
    { key: "status", label: "Status" },
    { key: "inStock", label: "In Stock" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
