import Link from "next/link";
import { Download } from "lucide-react";
import { getAllOrdersForAdmin } from "@/lib/data/admin";
import { formatDateOnly, formatPrice } from "@/lib/format";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, orderStatusBadgeClass } from "@/lib/admin/statuses";
import DashboardFilters, { DashboardFilterField, DashboardMoreFilters, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel, dashboardButtonSecondary } from "@/components/dashboard/DashboardUI";
import { normalizeReference, normalizeSearchText } from "@/lib/search/normalize";
import DateRangePicker from "@/components/ui/DateRangePicker";
import AdminWorkspaceNav from "@/components/admin/AdminWorkspaceNav";
import SortableTableHeader, { tableSortHref } from "@/components/dashboard/SortableTableHeader";

type OrderSearchParams = { q?: string; status?: string; brand?: string; from?: string; to?: string; sort?: string; page?: string };
const PAGE_SIZE = 25;

export default async function AdminOrdersPage(props: { searchParams: Promise<OrderSearchParams> }) {
  const params = await props.searchParams;
  const allOrders = await getAllOrdersForAdmin();
  const query = normalizeSearchText(params.q ?? "");
  const referenceQuery = normalizeReference(params.q ?? "");
  const filtered = allOrders.filter((order) => {
    if (query) {
      const text = normalizeSearchText(`${order.masterOrderNumber} ${order.orderNumber} ${order.shippingName} ${order.shippingEmail}`);
      const referenceMatch = referenceQuery.length >= 3 && [order.masterOrderNumber, order.orderNumber].some((value) => normalizeReference(value ?? "").includes(referenceQuery));
      if (!text.includes(query) && !referenceMatch) return false;
    }
    if (params.status && order.status !== params.status) return false;
    if (params.brand && !order.items.some((item) => item.brand === params.brand)) return false;
    if (params.from && new Date(order.createdAt) < new Date(`${params.from}T00:00:00`)) return false;
    if (params.to && new Date(order.createdAt) > new Date(`${params.to}T23:59:59.999`)) return false;
    return true;
  });
  filtered.sort((a, b) => {
    const direction = params.sort?.endsWith("-desc") ? -1 : 1;
    if (params.sort?.startsWith("order-")) return direction * a.orderNumber.localeCompare(b.orderNumber, undefined, { numeric: true });
    if (params.sort?.startsWith("customer-")) return direction * a.shippingName.localeCompare(b.shippingName);
    if (params.sort?.startsWith("shipment-")) return direction * a.fulfillmentType.localeCompare(b.fulfillmentType);
    if (params.sort?.startsWith("total-")) return direction * (a.subtotalEgp - b.subtotalEgp);
    if (params.sort?.startsWith("status-")) return direction * a.status.localeCompare(b.status);
    if (params.sort?.startsWith("date-")) return direction * (Date.parse(a.createdAt) - Date.parse(b.createdAt));
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(Number(params.page) || 1, 1), pageCount);
  const orders = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const brands = [...new Set(allOrders.flatMap((order) => order.items.map((item) => item.brand)).filter(Boolean))].sort();
  const activeCount = [params.q, params.status, params.brand, params.from, params.to, params.sort].filter(Boolean).length;
  const pageHref = (page: number) => { const next = new URLSearchParams(); Object.entries(params).forEach(([key, value]) => { if (value && key !== "page") next.set(key, value); }); next.set("page", String(page)); return `/admin/orders?${next}`; };

  return (
    <div>
      <AdminWorkspaceNav workspace="commerce" activeHref="/admin/orders" />
      <DashboardPageHeader eyebrow="Commerce" title={`Orders (${filtered.length})`} description="Search and review real customer orders, then open an order to update its operational status." actions={
        // A file download endpoint, not a navigable page.
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        <a href="/api/admin/orders/export" className={dashboardButtonSecondary}><Download className="mr-2 h-4 w-4" />Export CSV</a>
      } />
      <DashboardFilters action="/admin/orders" clearHref="/admin/orders" activeCount={activeCount}>
        <DashboardFilterField label="Search" className="lg:flex-1"><input name="q" defaultValue={params.q ?? ""} placeholder="Purchase #, order, customer or email" className={`${dashboardFilterControl} w-full lg:min-w-[240px]`} /></DashboardFilterField>
        <DateRangePicker defaultFrom={params.from} defaultTo={params.to} popoverAlign="right" compact />
        <DashboardMoreFilters label="More order filters" active={Boolean(params.status || params.brand)}>
          <DashboardFilterField label="Status"><select name="status" defaultValue={params.status ?? ""} className={`${dashboardFilterControl} w-full`}><option value="">All statuses</option>{ORDER_STATUSES.map((status) => <option key={status} value={status}>{ORDER_STATUS_LABELS[status]}</option>)}</select></DashboardFilterField>
          <DashboardFilterField label="Brand"><select name="brand" defaultValue={params.brand ?? ""} className={`${dashboardFilterControl} w-full`}><option value="">All brands</option>{brands.map((brand) => <option key={brand}>{brand}</option>)}</select></DashboardFilterField>
        </DashboardMoreFilters>
      </DashboardFilters>

      <DashboardPanel className="mt-6">
        {orders.length ? <div className="overflow-x-auto"><table className="w-full min-w-[960px] text-left text-[13px]"><thead className="border-b border-slate-200 bg-slate-50/80 text-[10.5px] uppercase tracking-[0.08em] text-slate-500"><tr><SortableTableHeader label="Order" href={tableSortHref("/admin/orders", params, "order")} active={params.sort?.startsWith("order-")} direction={params.sort?.endsWith("desc") ? "desc" : "asc"} /><SortableTableHeader label="Customer" href={tableSortHref("/admin/orders", params, "customer")} active={params.sort?.startsWith("customer-")} direction={params.sort?.endsWith("desc") ? "desc" : "asc"} /><SortableTableHeader label="Shipment" href={tableSortHref("/admin/orders", params, "shipment")} active={params.sort?.startsWith("shipment-")} direction={params.sort?.endsWith("desc") ? "desc" : "asc"} /><SortableTableHeader label="Date" href={tableSortHref("/admin/orders", params, "date", "desc")} active={!params.sort || params.sort.startsWith("date-")} direction={!params.sort || params.sort.endsWith("desc") ? "desc" : "asc"} /><SortableTableHeader label="Total" href={tableSortHref("/admin/orders", params, "total", "desc")} active={params.sort?.startsWith("total-")} direction={params.sort?.endsWith("desc") ? "desc" : "asc"} /><SortableTableHeader label="Status" href={tableSortHref("/admin/orders", params, "status")} active={params.sort?.startsWith("status-")} direction={params.sort?.endsWith("desc") ? "desc" : "asc"} /><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{orders.map((order) => (
          <tr key={order.id} className="hover:bg-slate-50/70"><td className="px-5 py-4"><p className="font-bold text-slate-950">#{order.orderNumber}</p><p className="mt-0.5 text-[11px] text-slate-500">Purchase {order.masterOrderNumber}</p></td><td className="px-5 py-4"><p className="font-medium text-slate-800">{order.shippingName}</p><p className="mt-0.5 text-[11px] text-slate-500">{order.shippingEmail}</p></td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${order.fulfillmentType === "mahaly_pool" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700"}`}>{order.fulfillmentType === "mahaly_pool" ? "Zakhnook pool" : order.brandSlug ?? "Brand direct"}</span></td><td className="px-5 py-4 text-slate-500">{formatDateOnly(order.createdAt)}</td><td className="px-5 py-4 font-bold text-slate-900">{order.subtotalUsd > 0 && formatPrice(order.subtotalUsd, "USD")}{order.subtotalUsd > 0 && order.subtotalEgp > 0 && " + "}{order.subtotalEgp > 0 && formatPrice(order.subtotalEgp, "EGP")}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${orderStatusBadgeClass(order.status)}`}>{ORDER_STATUS_LABELS[order.status]}</span></td><td className="px-5 py-4 text-right"><Link href={`/admin/orders/${order.id}`} className="text-[12px] font-bold text-mahalyred hover:underline">View order</Link></td></tr>
        ))}</tbody></table></div> : <DashboardEmptyState title="No matching orders" description={activeCount ? "Clear or adjust the active filters to see more orders." : "Customer orders will appear here when they are placed."} />}
        {pageCount > 1 && <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4"><p className="text-[11.5px] text-slate-500">Page {currentPage} of {pageCount}</p><div className="flex gap-2">{currentPage > 1 && <Link href={pageHref(currentPage - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11.5px] font-semibold text-slate-700">Previous</Link>}{currentPage < pageCount && <Link href={pageHref(currentPage + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11.5px] font-semibold text-slate-700">Next</Link>}</div></div>}
      </DashboardPanel>
    </div>
  );
}
