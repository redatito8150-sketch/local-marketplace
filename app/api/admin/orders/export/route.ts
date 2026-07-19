import { NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { getAllOrdersForAdmin } from "@/lib/data/admin";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const orders = await getAllOrdersForAdmin();

  const csv = toCsv(orders, [
    { key: "orderNumber", label: "Order Number" },
    { key: "status", label: "Status" },
    { key: "shippingName", label: "Customer" },
    { key: "shippingEmail", label: "Email" },
    { key: "subtotalEgp", label: "Subtotal (EGP)" },
    { key: "subtotalUsd", label: "Subtotal (USD)" },
    { key: "shippingCity", label: "City" },
    { key: "shippingGovernorate", label: "Governorate" },
    { key: "createdAt", label: "Date" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
