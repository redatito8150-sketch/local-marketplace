import { redirect } from "next/navigation";
import Image from "next/image";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getOrdersForBrand } from "@/lib/data/brandPortal";
import { getAllBrandsForAdmin } from "@/lib/data/admin";
import { formatDateOnly, formatPrice, formatSize } from "@/lib/format";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, orderStatusBadgeClass } from "@/lib/admin/statuses";
import BrandPicker from "@/components/brand-portal/BrandPicker";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import BrandOrderStatusControl from "@/components/brand-portal/BrandOrderStatusControl";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";
import BrandOrderPricingSummary from "@/components/brand-portal/BrandOrderPricingSummary";
import type { OrderStatus } from "@/types";

type OrderParams = { brand?: string; q?: string; status?: string; from?: string; to?: string; sort?: string };

export default async function BrandPortalOrdersPage(props: { searchParams: Promise<OrderParams> }) {
  const params = await props.searchParams;
  const owner = await requireBrandOwner(params.brand);
  if (!owner) redirect("/account");
  if (!owner.brandSlug) { const brands = await getAllBrandsForAdmin(); return <BrandPicker brands={brands.map((brand) => ({ slug: brand.slug, name: brand.name }))} />; }
  const brandSlug = owner.brandSlug;
  const allOrders = await getOrdersForBrand(brandSlug, owner.isImpersonating);
  const query = params.q?.trim().toLowerCase();
  // This brand's own portion only — item prices minus this brand's own
  // share of the coupon discount, plus the shipment's delivery fee. Never
  // orders.subtotal_egp/discount_amount_egp (see BrandOrderPricingSummary's
  // own comment on why those can include other brands' pooled totals).
  const orderTotal = (order: (typeof allOrders)[number]) =>
    order.items.reduce((sum, item) => (item.currency === "EGP" ? sum + item.price * item.quantity : sum), 0) -
    order.brandDiscountEgp +
    order.shippingFeeEgp;
  const orders = allOrders.filter((order) => {
    if (query && !`${order.orderNumber} ${order.shippingName} ${order.shippingCity} ${order.items.map((item) => item.name).join(" ")}`.toLowerCase().includes(query)) return false;
    if (params.status && order.status !== params.status) return false;
    if (params.from && new Date(order.createdAt) < new Date(`${params.from}T00:00:00`)) return false;
    if (params.to && new Date(order.createdAt) > new Date(`${params.to}T23:59:59.999`)) return false;
    return true;
  });
  orders.sort((a, b) => params.sort === "oldest" ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() : params.sort === "total-desc" ? orderTotal(b) - orderTotal(a) : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const activeCount = [params.q, params.status, params.from, params.to, params.sort].filter(Boolean).length;

  return (
    <div>
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <DashboardPageHeader eyebrow="Sales" title={`Orders (${orders.length})`} description="View only the orders that contain products attributed to your brand." />
      <DashboardFilters action="/brand-portal/orders" clearHref={`/brand-portal/orders${owner.isImpersonating ? `?brand=${owner.brandSlug}` : ""}`} activeCount={activeCount}>
        {owner.isImpersonating && <input type="hidden" name="brand" value={owner.brandSlug} />}
        <DashboardFilterField label="Search" className="lg:flex-1"><input name="q" defaultValue={params.q ?? ""} placeholder="Order, customer or product" className={`${dashboardFilterControl} w-full lg:min-w-[240px]`} /></DashboardFilterField>
        <DashboardFilterField label="Status"><select name="status" defaultValue={params.status ?? ""} className={dashboardFilterControl}><option value="">All statuses</option>{ORDER_STATUSES.map((status) => <option key={status} value={status}>{ORDER_STATUS_LABELS[status]}</option>)}</select></DashboardFilterField>
        <DashboardFilterField label="From"><input type="date" name="from" defaultValue={params.from ?? ""} className={dashboardFilterControl} /></DashboardFilterField>
        <DashboardFilterField label="To"><input type="date" name="to" defaultValue={params.to ?? ""} className={dashboardFilterControl} /></DashboardFilterField>
        <DashboardFilterField label="Sort"><select name="sort" defaultValue={params.sort ?? ""} className={dashboardFilterControl}><option value="">Newest</option><option value="oldest">Oldest</option><option value="total-desc">Highest total</option></select></DashboardFilterField>
      </DashboardFilters>
      <DashboardPanel className="mt-6">
        {orders.length ? <div className="divide-y divide-[#eee7de]">{orders.map((order) => (
          <article key={order.id} className="px-5 py-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[13px] font-bold text-[#242424]">#{order.orderNumber}</p><p className="mt-1 text-[11px] text-[#8a7d73]">{order.shippingName} · {order.shippingCity}, {order.shippingGovernorate} · {formatDateOnly(order.createdAt)}</p><p className="mt-1 text-[10.5px] font-medium text-[#8a7d73]">{order.fulfillmentType === "mahaly_pool" ? "Fulfilled by Zakhnook (pooled with other partner brands)" : "Your shipment — pack & hand off to Zakhnook for delivery"}</p></div><div className="flex flex-col items-end gap-2"><div className="flex items-center gap-3"><p className="text-[13px] font-bold text-[#242424]">{formatPrice(orderTotal(order), "EGP")}</p><span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${orderStatusBadgeClass(order.status as OrderStatus)}`}>{ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}</span></div>{order.fulfillmentType === "brand_direct" && <BrandOrderStatusControl orderId={order.id} status={order.status} brandSlug={brandSlug} />}</div></div><div className="mt-4 grid gap-2 border-t border-[#eee7de] pt-3 sm:grid-cols-2 xl:grid-cols-3">{order.items.map((item) => {
            const showStrikethrough = item.discountSource != null && item.discountSource !== "none" && item.originalUnitPrice != null;
            return (
              <div key={item.id} className="flex gap-2.5 rounded-xl bg-[#fbf8f4] px-3 py-2.5">
                {item.image && <div className="relative h-14 w-11 shrink-0 overflow-hidden rounded-lg bg-[#eee7de]"><Image src={item.image} alt="" fill sizes="44px" className="object-cover" /></div>}
                <div className="min-w-0">
                  <p className="truncate text-[11.5px] font-semibold text-[#51473f]">{item.name}</p>
                  <p className="mt-1 text-[10.5px] text-[#8a7d73]">Qty {item.quantity} · {formatSize(item.size)}{item.color ? ` · ${item.color}` : ""}</p>
                  <p className="mt-1 text-[10.5px] text-[#51473f]">
                    {showStrikethrough && <span className="mr-1.5 text-[#a68f68] line-through">{formatPrice(item.originalUnitPrice!, item.currency)}</span>}
                    <span className="font-semibold">{formatPrice(item.price, item.currency)}</span>
                    {item.quantity > 1 && <span className="ml-1 text-[#8a7d73]">× {item.quantity} = {formatPrice(item.price * item.quantity, item.currency)}</span>}
                  </p>
                </div>
              </div>
            );
          })}</div><BrandOrderPricingSummary order={order} /></article>
        ))}</div> : <DashboardEmptyState title="No matching orders" description={activeCount ? "Clear or adjust the filters to see more orders." : "Orders containing your products will appear here."} />}
      </DashboardPanel>
    </div>
  );
}
