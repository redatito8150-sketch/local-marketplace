import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { getAdminOrderPurchasePage } from "@/lib/data/admin";
import { toCsv } from "@/lib/csv";
import { normalizeAdminOrderFilters, type AdminPurchaseGroup } from "@/lib/orders/adminOrderFilters";

const EXPORT_PAGE_SIZE = 100;

function purchaseTotal(group: AdminPurchaseGroup, currency: "EGP" | "USD") {
  return currency === "EGP" ? group.subtotalEgp : group.subtotalUsd;
}

export async function GET(request: NextRequest) {
  const staff = await requireStaffRole("manager");
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const search = request.nextUrl.searchParams;
  const filters = normalizeAdminOrderFilters({
    q: search.get("q") ?? undefined,
    queue: search.get("queue") ?? undefined,
    status: search.get("status") ?? undefined,
    brand: search.get("brand") ?? undefined,
    from: search.get("from") ?? undefined,
    to: search.get("to") ?? undefined,
  });
  const firstPage = await getAdminOrderPurchasePage(filters, 1, EXPORT_PAGE_SIZE);
  const groups = [...firstPage.groups];
  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const nextPage = await getAdminOrderPurchasePage(filters, page, EXPORT_PAGE_SIZE);
    groups.push(...nextPage.groups);
  }

  const rows = groups.map((group) => ({
    purchaseNumber: group.number,
    shipmentNumbers: group.shipments.map((shipment) => shipment.orderNumber).join(" | "),
    statuses: [...new Set(group.shipments.map((shipment) => shipment.status))].join(" | "),
    customer: group.customerName,
    email: group.customerEmail,
    city: group.customerCity,
    brands: [...new Set(group.items.map((item) => item.brand))].join(" | "),
    variants: group.items.length,
    units: group.items.reduce((sum, item) => sum + item.quantity, 0),
    shipments: group.shipments.length,
    progress: group.progress.label,
    needsAction: [...new Set(group.attentionReasons.map((reason) => reason.label))].join(" | "),
    totalEgp: purchaseTotal(group, "EGP"),
    totalUsd: purchaseTotal(group, "USD"),
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  }));
  const csv = toCsv(rows, [
    { key: "purchaseNumber", label: "Purchase Number" },
    { key: "shipmentNumbers", label: "Shipment Numbers" },
    { key: "statuses", label: "Statuses" },
    { key: "customer", label: "Customer" },
    { key: "email", label: "Email" },
    { key: "city", label: "City" },
    { key: "brands", label: "Brands" },
    { key: "variants", label: "Variants" },
    { key: "units", label: "Units" },
    { key: "shipments", label: "Shipments" },
    { key: "progress", label: "Progress" },
    { key: "needsAction", label: "Needs Action" },
    { key: "totalEgp", label: "Total (EGP)" },
    { key: "totalUsd", label: "Total (USD)" },
    { key: "createdAt", label: "Created At" },
    { key: "updatedAt", label: "Updated At" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
