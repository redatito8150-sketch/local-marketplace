import { getAllOrdersForAdmin } from "@/lib/data/admin";
import { DashboardPageHeader } from "@/components/dashboard/DashboardUI";
import AdminOrdersWorkspace from "@/components/admin/AdminOrdersWorkspace";
import {
  belongsToAdminOrderQueue,
  filterAdminOrders,
  groupAdminOrders,
  normalizeAdminOrderQueue,
  type AdminOrderQueue,
} from "@/lib/orders/adminOrderFilters";

type OrderSearchParams = {
  q?: string;
  queue?: string;
  status?: string;
  brand?: string;
  from?: string;
  to?: string;
  page?: string;
  order?: string;
};

const PAGE_SIZE = 12;

export default async function AdminOrdersPage(props: { searchParams: Promise<OrderSearchParams> }) {
  const params = await props.searchParams;
  const allOrders = await getAllOrdersForAdmin();
  const queue = normalizeAdminOrderQueue(params.queue);
  const matchingOrders = filterAdminOrders(allOrders, { ...params, queue });
  const matchingIds = new Set(matchingOrders.map((order) => order.id));
  const grouped = groupAdminOrders(allOrders)
    .filter((group) => group.shipments.some((shipment) => matchingIds.has(shipment.id)))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const counts: Record<AdminOrderQueue, number> = {
    all: groupAdminOrders(allOrders).length,
    attention: groupAdminOrders(allOrders.filter((order) => belongsToAdminOrderQueue(order, "attention"))).length,
    active: groupAdminOrders(allOrders.filter((order) => belongsToAdminOrderQueue(order, "active"))).length,
    fulfilled: groupAdminOrders(allOrders.filter((order) => belongsToAdminOrderQueue(order, "fulfilled"))).length,
    cancelled: groupAdminOrders(allOrders.filter((order) => belongsToAdminOrderQueue(order, "cancelled"))).length,
  };
  const totalPages = Math.max(1, Math.ceil(grouped.length / PAGE_SIZE));
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const page = Math.min(requestedPage, totalPages);
  const groups = grouped.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedOrder = params.order ? allOrders.find((order) => order.id === params.order) ?? null : null;
  const brands = [...new Set(allOrders.flatMap((order) => order.items.map((item) => item.brand)).filter(Boolean))].sort();

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Commerce"
        title="Orders"
        description="Follow each customer purchase as one record, then inspect its shipments, products, payment and fulfillment without losing your place."
      />
      <AdminOrdersWorkspace
        groups={groups}
        selectedOrder={selectedOrder}
        counts={counts}
        brands={brands}
        params={{ ...params, queue }}
        page={page}
        totalPages={totalPages}
        totalPurchases={grouped.length}
      />
    </div>
  );
}
