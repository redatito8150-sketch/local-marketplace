import { NextRequest, NextResponse } from "next/server";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getOrdersForBrand } from "@/lib/data/brandPortal";
import { filterBrandOrders } from "@/lib/orders/brandOrderFilters";
import { toCsv } from "@/lib/csv";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const owner = await requireBrandOwner(params.get("brand") ?? undefined);
  if (!owner?.brandSlug) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const orders = filterBrandOrders(
    await getOrdersForBrand(owner.brandSlug, owner.isImpersonating),
    {
      q: params.get("q") ?? undefined,
      queue: params.get("queue") ?? undefined,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
      sort: params.get("sort") ?? undefined,
    }
  );
  const rows = orders.map((order) => ({
    orderNumber: order.orderNumber,
    status: order.status,
    customer: order.shippingName,
    city: order.shippingCity,
    governorate: order.shippingGovernorate,
    fulfillment: order.fulfillmentType,
    paymentMethod: order.paymentMethod ?? "",
    paymentStatus: order.paymentStatus ?? "",
    variants: order.items.map((item) => `${item.name} / ${item.color || "No color"} / ${item.size || "One Size"} x${item.quantity}`).join(" | "),
    totalEgp: order.items.reduce((sum, item) => sum + (item.currency === "EGP" ? item.price * item.quantity : 0), 0),
    overdue: order.isOverdue ? "Yes" : "No",
    createdAt: order.createdAt,
  }));

  const csv = toCsv(rows, [
    { key: "orderNumber", label: "Order Number" },
    { key: "status", label: "Status" },
    { key: "customer", label: "Customer" },
    { key: "city", label: "City" },
    { key: "governorate", label: "Governorate" },
    { key: "fulfillment", label: "Fulfillment" },
    { key: "paymentMethod", label: "Payment Method" },
    { key: "paymentStatus", label: "Payment Status" },
    { key: "variants", label: "Variants" },
    { key: "totalEgp", label: "Brand Total (EGP)" },
    { key: "overdue", label: "Overdue" },
    { key: "createdAt", label: "Created At" },
  ]);

  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${owner.brandSlug}-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
