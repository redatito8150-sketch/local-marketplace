import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CircleDollarSign,
  Clock3,
  FileText,
  Package,
  ShoppingBag,
  Store,
} from "lucide-react";
import {
  getAllApplicationsForAdmin,
  getAllBrandsForAdmin,
  getAllOrdersForAdmin,
  getAllProductsForAdmin,
  getAllAuditLogsForAdmin,
  getBrandActivityNotifications,
  getLowStockVariantsForAdmin,
} from "@/lib/data/admin";
import { getRevenueSummary, getTopProducts, getTopBrands, getDailyRevenueTrend } from "@/lib/data/analytics";
import { formatPrice } from "@/lib/format";
import RevenueChart from "@/components/admin/RevenueChart";
import { describeAuditLog } from "@/lib/auditLogDescribe";
import {
  DashboardEmptyState,
  DashboardPageHeader,
  DashboardPanel,
  DashboardStatCard,
  dashboardButtonPrimary,
  dashboardButtonSecondary,
} from "@/components/dashboard/DashboardUI";
import { ORDER_STATUS_LABELS, orderStatusBadgeClass } from "@/lib/admin/statuses";
import { requireStaffRole } from "@/lib/supabase/adminAuth";

export default async function AdminOverviewPage() {
  const canViewAuditLog = Boolean(await requireStaffRole("admin"));
  const [products, brands, orders, applications, revenue, topProducts, topBrands, trend, lowStock, brandActivity, auditLogs] =
    await Promise.all([
      getAllProductsForAdmin(),
      getAllBrandsForAdmin(),
      getAllOrdersForAdmin(),
      getAllApplicationsForAdmin(),
      getRevenueSummary(),
      getTopProducts(5),
      getTopBrands(5),
      getDailyRevenueTrend(14),
      getLowStockVariantsForAdmin(),
      getBrandActivityNotifications(6),
      canViewAuditLog ? getAllAuditLogsForAdmin(8) : Promise.resolve([]),
    ]);

  const pendingOrders = orders.filter((order) => order.status === "pending");
  const newApplications = applications.filter((application) => application.status === "new");
  const pendingBrandActivity = brandActivity.filter((notification) => notification.resolution === "pending");
  const recentOrders = orders.slice(0, 5);
  const alertCount = pendingOrders.length + newApplications.length + pendingBrandActivity.length + lowStock.length;

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        eyebrow="Operations overview"
        title="Good to see you"
        description="Monitor marketplace performance, review pending work, and act on the items that need attention."
        actions={
          <>
            <Link href="/admin/products/new" className={dashboardButtonSecondary}>Add product</Link>
            <Link href="/admin/orders" className={dashboardButtonPrimary}>Review orders</Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <DashboardStatCard label="Revenue today" value={formatPrice(revenue.today, "EGP")} detail={`${formatPrice(revenue.week, "EGP")} in 7 days`} icon={CircleDollarSign} tone="success" href="/admin/analytics" />
        <DashboardStatCard label="Orders" value={orders.length} detail={`${pendingOrders.length} pending`} icon={ShoppingBag} tone={pendingOrders.length ? "warning" : "neutral"} href="/admin/orders" />
        <DashboardStatCard label="Products" value={products.length} detail={`${lowStock.length} low-stock variants`} icon={Package} tone={lowStock.length ? "warning" : "info"} href="/admin/products" />
        <DashboardStatCard label="Brands" value={brands.length} detail={`${newApplications.length} new applications`} icon={Store} tone="brand" href="/admin/brands" />
        <DashboardStatCard label="Pending reviews" value={pendingBrandActivity.length + newApplications.length} detail="Applications and brand activity" icon={Clock3} tone="warning" href="/admin/products/review" />
        <DashboardStatCard label="Alerts" value={alertCount} detail="Across orders, stock and approvals" icon={AlertTriangle} tone={alertCount ? "brand" : "neutral"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
        <DashboardPanel title="Revenue trend" description="Daily EGP revenue over the last 14 days" action={<Link href="/admin/analytics" className="text-[12px] font-semibold text-mahalyred hover:underline">Open analytics</Link>}>
          <div className="px-5 pb-5 pt-3"><RevenueChart points={trend} /></div>
        </DashboardPanel>

        <DashboardPanel title="Important alerts" description="Live operational signals">
          <div className="divide-y divide-slate-100">
            <AlertRow label="Pending orders" value={pendingOrders.length} href="/admin/orders?status=pending" tone="warning" />
            <AlertRow label="Low-stock variants" value={lowStock.length} href="/admin/low-stock" tone="danger" />
            <AlertRow label="New brand applications" value={newApplications.length} href="/admin/applications" tone="info" />
            <AlertRow label="Brand changes to review" value={pendingBrandActivity.length} href="/admin/products/review" tone="warning" />
          </div>
        </DashboardPanel>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.6fr)]">
        <DashboardPanel title="Recent orders" description="Latest marketplace purchases" action={<Link href="/admin/orders" className="text-[12px] font-semibold text-mahalyred hover:underline">View all orders</Link>}>
          {recentOrders.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-[13px]">
                <thead className="bg-slate-50/80 text-[10.5px] uppercase tracking-[0.08em] text-slate-500">
                  <tr><th className="px-5 py-3 font-semibold">Order</th><th className="px-5 py-3 font-semibold">Customer</th><th className="px-5 py-3 font-semibold">Total</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 font-semibold">Date</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="px-5 py-4"><Link href={`/admin/orders/${order.id}`} className="font-semibold text-slate-950 hover:text-mahalyred">#{order.orderNumber}</Link></td>
                      <td className="px-5 py-4"><p className="font-medium text-slate-800">{order.shippingName}</p><p className="mt-0.5 text-[11px] text-slate-500">{order.shippingEmail}</p></td>
                      <td className="px-5 py-4 font-semibold text-slate-900">{order.subtotalEgp > 0 ? formatPrice(order.subtotalEgp, "EGP") : formatPrice(order.subtotalUsd, "USD")}</td>
                      <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${orderStatusBadgeClass(order.status)}`}>{ORDER_STATUS_LABELS[order.status]}</span></td>
                      <td className="px-5 py-4 text-slate-500">{new Date(order.createdAt).toLocaleDateString("en-US")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <DashboardEmptyState title="No orders yet" description="New customer orders will appear here as soon as they are placed." />}
        </DashboardPanel>

        <DashboardPanel title="Top performers" description="Last 30 days of real sales">
          <div className="p-5">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-400">Products</p>
            <div className="mt-3 space-y-3">
              {topProducts.map((product, index) => (
                <div key={product.productId ?? product.name} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-bold text-slate-600">{index + 1}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-[12.5px] font-semibold text-slate-900">{product.name}</p><p className="text-[11px] text-slate-500">{product.brand} · {product.quantity} sold</p></div>
                  <p className="text-[12px] font-bold text-slate-900">{formatPrice(product.revenue, "EGP")}</p>
                </div>
              ))}
              {!topProducts.length && <p className="text-[12px] text-slate-500">No sales in this period.</p>}
            </div>
            <div className="my-5 border-t border-slate-100" />
            <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-400">Brands</p>
            <div className="mt-3 space-y-2.5">
              {topBrands.map((brand) => <div key={brand.brand} className="flex items-center justify-between gap-3"><p className="truncate text-[12.5px] font-semibold text-slate-800">{brand.brand}</p><p className="text-[12px] font-bold text-slate-900">{formatPrice(brand.revenue, "EGP")}</p></div>)}
              {!topBrands.length && <p className="text-[12px] text-slate-500">No brand sales in this period.</p>}
            </div>
          </div>
        </DashboardPanel>
      </div>

      <div className={`grid gap-6 ${canViewAuditLog ? "xl:grid-cols-2" : ""}`}>
        <DashboardPanel title="Recent brand activity" description="Latest owner and assistant product actions" action={<Link href="/admin/products/review" className="text-[12px] font-semibold text-mahalyred hover:underline">Review activity</Link>}>
          {brandActivity.length ? <div className="divide-y divide-slate-100">{brandActivity.slice(0, 5).map((item) => <div key={item.id} className="px-5 py-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[12.5px] font-semibold text-slate-900">{item.title}</p>{item.body && <p className="mt-1 text-[11.5px] leading-5 text-slate-500">{item.body}</p>}</div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.resolution === "pending" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{item.resolution}</span></div></div>)}</div> : <DashboardEmptyState title="No brand activity" description="Brand product changes will appear here." />}
        </DashboardPanel>

        {canViewAuditLog && <DashboardPanel title="Recent user activity" description="Latest recorded actions across the platform" action={<Link href="/admin/audit-log" className="text-[12px] font-semibold text-mahalyred hover:underline">Open audit log</Link>}>
          {auditLogs.length ? <div className="divide-y divide-slate-100">{auditLogs.slice(0, 5).map((log) => <div key={log.id} className="flex items-start gap-3 px-5 py-4"><div className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-slate-100"><FileText className="h-4 w-4 text-slate-500" /></div><div className="min-w-0"><p className="text-[12.5px] leading-5 text-slate-800">{describeAuditLog(log)}</p><p className="mt-1 text-[10.5px] text-slate-400">{new Date(log.createdAt).toLocaleString("en-US")}</p></div></div>)}</div> : <DashboardEmptyState title="No recorded activity" description="Administrative and brand actions will appear here." />}
        </DashboardPanel>}
      </div>

      <DashboardPanel title="Quick actions" description="Common operational tasks">
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction label="Add a product" href="/admin/products/new" icon={Package} />
          <QuickAction label="Add a brand" href="/admin/brands/new" icon={Store} />
          <QuickAction label="Review applications" href="/admin/applications" icon={FileText} />
          <QuickAction label="View low stock" href="/admin/low-stock" icon={AlertTriangle} />
        </div>
      </DashboardPanel>
    </div>
  );
}

function AlertRow({ label, value, href, tone }: { label: string; value: number; href: string; tone: "warning" | "danger" | "info" }) {
  const toneClass = tone === "danger" ? "bg-red-50 text-red-700" : tone === "warning" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700";
  return <Link href={href} className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-slate-50"><span className="text-[12.5px] font-semibold text-slate-700">{label}</span><span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${toneClass}`}>{value}</span></Link>;
}

function QuickAction({ label, href, icon: Icon }: { label: string; href: string; icon: React.ElementType }) {
  return <Link href={href} className="group flex items-center gap-3 rounded-xl border border-slate-200 p-4 transition-colors hover:border-slate-300 hover:bg-slate-50"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Icon className="h-4 w-4" /></div><span className="flex-1 text-[12.5px] font-semibold text-slate-800">{label}</span><ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-mahalyred" /></Link>;
}
