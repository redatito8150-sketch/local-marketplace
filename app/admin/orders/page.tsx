import { getAdminOrderPurchasePage, getAdminPurchaseForAdminByOrderId } from "@/lib/data/admin";
import { DashboardPageHeader } from "@/components/dashboard/DashboardUI";
import AdminOrdersWorkspace from "@/components/admin/AdminOrdersWorkspace";
import { normalizeAdminOrderFilters } from "@/lib/orders/adminOrderFilters";

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
  const filters = normalizeAdminOrderFilters(params);
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const [purchasePage, selectedPurchase] = await Promise.all([
    getAdminOrderPurchasePage(filters, requestedPage, PAGE_SIZE),
    params.order ? getAdminPurchaseForAdminByOrderId(params.order) : Promise.resolve(null),
  ]);

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Commerce"
        title="Orders"
        description="Follow each customer purchase as one record, then inspect its shipments, products, payment and fulfillment without losing your place."
      />
      <AdminOrdersWorkspace
        groups={purchasePage.groups}
        selectedPurchase={selectedPurchase}
        selectedShipmentId={params.order}
        counts={purchasePage.counts}
        brands={purchasePage.brands}
        params={{ ...params, ...filters }}
        page={purchasePage.page}
        totalPages={purchasePage.totalPages}
        totalPurchases={purchasePage.totalPurchases}
      />
    </div>
  );
}
