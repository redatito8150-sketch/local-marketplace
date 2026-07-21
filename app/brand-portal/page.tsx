import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowUpRight, CircleDollarSign, ClipboardList, Package, ShoppingBag, Store } from "lucide-react";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getOrdersForBrand, getProductsForBrand, getVariantsForBrand } from "@/lib/data/brandPortal";
import { getAllBrandsForAdmin, getAuditLogsForBrand, getBrandForAdmin } from "@/lib/data/admin";
import { getBestSellingProductsForBrand } from "@/lib/data/collections";
import { formatPrice } from "@/lib/format";
import { describeAuditLog } from "@/lib/auditLogDescribe";
import BrandPicker from "@/components/brand-portal/BrandPicker";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import {
  DashboardEmptyState,
  DashboardPageHeader,
  DashboardPanel,
  DashboardStatCard,
  dashboardButtonPrimary,
  dashboardButtonSecondary,
} from "@/components/dashboard/DashboardUI";
import { ORDER_STATUS_LABELS, orderStatusBadgeClass } from "@/lib/admin/statuses";

export default async function BrandPortalOverviewPage(props: { searchParams: Promise<{ brand?: string }> }) {
  const searchParams = await props.searchParams;
  const owner = await requireBrandOwner(searchParams.brand);
  if (!owner) redirect("/account");

  if (!owner.brandSlug) {
    const brands = await getAllBrandsForAdmin();
    return <BrandPicker brands={brands.map((brand) => ({ slug: brand.slug, name: brand.name }))} />;
  }

  const [orders, variants, products, bestSellers, brand, activity] = await Promise.all([
    getOrdersForBrand(owner.brandSlug, owner.isImpersonating),
    getVariantsForBrand(owner.brandSlug, owner.isImpersonating),
    getProductsForBrand(owner.brandSlug, owner.isImpersonating),
    getBestSellingProductsForBrand(owner.brandSlug, 4),
    owner.accessLevel === "owner" ? getBrandForAdmin(owner.brandSlug) : Promise.resolve(null),
    owner.accessLevel === "owner" ? getAuditLogsForBrand(owner.brandSlug, 6) : Promise.resolve([]),
  ]);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const validOrders = orders.filter((order) => order.status !== "cancelled");
  const orderRevenue = (order: (typeof orders)[number]) => order.items.reduce((sum, item) => item.currency === "EGP" ? sum + item.price * item.quantity : sum, 0);
  const salesToday = validOrders.filter((order) => new Date(order.createdAt) >= startOfToday).reduce((sum, order) => sum + orderRevenue(order), 0);
  const salesMonth = validOrders.filter((order) => new Date(order.createdAt) >= startOfMonth).reduce((sum, order) => sum + orderRevenue(order), 0);
  const ordersToday = orders.filter((order) => new Date(order.createdAt) >= startOfToday).length;
  const pendingOrders = orders.filter((order) => order.status === "pending");
  const lowStock = variants.filter((variant) => variant.quantity > 0 && variant.quantity <= variant.lowStockThreshold);
  const outOfStock = variants.filter((variant) => variant.quantity <= 0);
  const pendingProducts = products.filter((product) => product.status === "pending_review" || product.status === "changes_requested" || product.hasPendingEdit);
  const pendingActions = pendingOrders.length + lowStock.length + outOfStock.length + pendingProducts.length;
  const profileFields = brand ? [brand.tagline, brand.category, brand.city, brand.heroImage, brand.logoImage, brand.websiteUrl, brand.aboutDescription, brand.aboutImage, brand.storyBody, brand.storyImage] : [];
  const profileCompleteness = profileFields.length ? Math.round((profileFields.filter(Boolean).length / profileFields.length) * 100) : 0;
  const brandParam = owner.isImpersonating ? `?brand=${owner.brandSlug}` : "";

  return (
    <div className="space-y-8">
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <DashboardPageHeader
        eyebrow="Brand performance"
        title={`Welcome back${owner.brandName ? `, ${owner.brandName}` : ""}`}
        description="A focused view of sales, orders, catalog health, and the actions that need your attention."
        actions={<><Link href={`/brand-portal/products/new${brandParam}`} className={dashboardButtonPrimary}>Add product</Link><Link href={`/brand-portal/orders${brandParam}`} className={dashboardButtonSecondary}>View orders</Link></>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        <DashboardStatCard label="Sales today" value={formatPrice(salesToday, "EGP")} detail={`${formatPrice(salesMonth, "EGP")} this month`} icon={CircleDollarSign} tone="success" />
        <DashboardStatCard label="Orders today" value={ordersToday} detail={`${pendingOrders.length} pending`} icon={ShoppingBag} tone={pendingOrders.length ? "warning" : "neutral"} href={`/brand-portal/orders${brandParam}`} />
        <DashboardStatCard label="Products" value={products.length} detail={`${pendingProducts.length} need review`} icon={Package} tone="info" href={`/brand-portal/products${brandParam}`} />
        <DashboardStatCard label="Low stock" value={lowStock.length} detail="Variants at threshold" icon={AlertTriangle} tone={lowStock.length ? "warning" : "neutral"} href={`/brand-portal/stock${brandParam}`} />
        <DashboardStatCard label="Out of stock" value={outOfStock.length} detail="Variants with no units" icon={AlertTriangle} tone={outOfStock.length ? "brand" : "neutral"} href={`/brand-portal/stock${brandParam}`} />
        {owner.accessLevel === "owner" && <DashboardStatCard label="Profile" value={`${profileCompleteness}%`} detail="Brand profile complete" icon={Store} tone="brand" href={`/brand-portal/page-content${brandParam}`} />}
        <DashboardStatCard label="Pending actions" value={pendingActions} detail="Orders, stock and catalog" icon={ClipboardList} tone={pendingActions ? "warning" : "success"} />
      </div>

      <div className={`grid gap-6 ${owner.accessLevel === "owner" ? "xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]" : ""}`}>
        <DashboardPanel title="Recent orders" description="Orders containing products from your brand" action={<Link href={`/brand-portal/orders${brandParam}`} className="text-[12px] font-semibold text-mahalyred hover:underline">View all orders</Link>}>
          {orders.length ? <div className="divide-y divide-slate-100">{orders.slice(0, 5).map((order) => (
            <div key={order.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-[12.5px] font-bold text-slate-900">#{order.orderNumber}</p><p className="mt-1 text-[11px] text-slate-500">{order.shippingName} · {order.shippingCity} · {new Date(order.createdAt).toLocaleDateString("en-US")}</p></div>
              <div className="flex items-center gap-3"><p className="text-[12.5px] font-bold text-slate-900">{formatPrice(orderRevenue(order), "EGP")}</p><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${orderStatusBadgeClass(order.status as never)}`}>{ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ?? order.status}</span></div>
            </div>
          ))}</div> : <DashboardEmptyState title="No orders yet" description="Orders containing your products will appear here." />}
        </DashboardPanel>

        {owner.accessLevel === "owner" && <DashboardPanel title="Profile completeness" description="A complete profile helps customers trust your brand">
          <div className="p-5">
            <div className="flex items-end justify-between gap-3"><p className="text-3xl font-bold tracking-[-0.04em] text-[#302b27]">{profileCompleteness}%</p><p className="text-[11px] font-semibold text-[#7b6f66]">{profileFields.filter(Boolean).length} of {profileFields.length} fields</p></div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#eee7de]"><div className="h-full rounded-full bg-mahalyred" style={{ width: `${profileCompleteness}%` }} /></div>
            <Link href={`/brand-portal/page-content${brandParam}`} className="mt-5 inline-flex text-[12px] font-bold text-mahalyred hover:underline">Complete brand profile</Link>
          </div>
        </DashboardPanel>}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardPanel title="Best-selling products" description="Ranked from real order quantities">
          {bestSellers.length ? <div className="grid gap-3 p-5 sm:grid-cols-2">{bestSellers.map((product, index) => (
            <div key={product.id} className="flex items-center gap-3 rounded-xl border border-[#e8e0d7] bg-[#fffdf9] p-3"><span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#f1eae2] text-[11px] font-bold text-[#75685f]">{index + 1}</span><div className="min-w-0"><p className="truncate text-[12.5px] font-bold text-[#302b27]">{product.name}</p><p className="mt-0.5 text-[11px] text-[#8a7d73]">{formatPrice(product.price, product.currency)}</p></div></div>
          ))}</div> : <DashboardEmptyState title="No sales ranking yet" description="Published products will appear here until sales data becomes available." />}
        </DashboardPanel>

        <DashboardPanel title="Recent product activity" description="Changes made by your team and Mahaly staff" action={owner.accessLevel === "owner" ? <Link href={`/brand-portal/logs${brandParam}`} className="text-[12px] font-semibold text-mahalyred hover:underline">View activity</Link> : undefined}>
          {activity.length ? <div className="divide-y divide-[#eee7de]">{activity.slice(0, 5).map((log) => <div key={log.id} className="px-5 py-4"><p className="text-[12.5px] leading-5 text-[#51473f]">{describeAuditLog(log)}</p><p className="mt-1 text-[10.5px] text-[#9b8e84]">{new Date(log.createdAt).toLocaleString("en-US")}</p></div>)}</div> : <DashboardEmptyState title={owner.accessLevel === "owner" ? "No activity recorded yet" : "Activity is owner-only"} description={owner.accessLevel === "owner" ? "Product and brand changes will appear here." : "Your brand owner can review the complete activity log."} />}
        </DashboardPanel>
      </div>

      <DashboardPanel title="Quick actions" description="The most common brand tasks">
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <QuickAction label="Add product" href={`/brand-portal/products/new${brandParam}`} icon={Package} />
          <QuickAction label="Update catalog" href={`/brand-portal/products${brandParam}`} icon={ClipboardList} />
          <QuickAction label="View inventory" href={`/brand-portal/stock${brandParam}`} icon={AlertTriangle} />
          {owner.accessLevel === "owner" && <QuickAction label="Edit brand profile" href={`/brand-portal/page-content${brandParam}`} icon={Store} />}
        </div>
      </DashboardPanel>

      <p className="rounded-xl border border-[#e3dcd3] bg-[#fffdf9] px-4 py-3 text-[11.5px] leading-5 text-[#7b6f66]">Orders placed before brand attribution was introduced may not appear here. All figures above are calculated from real attributed orders and catalog data.</p>
    </div>
  );
}

function QuickAction({ label, href, icon: Icon }: { label: string; href: string; icon: React.ElementType }) {
  return <Link href={href} className="group flex items-center gap-3 rounded-xl border border-[#e3dcd3] bg-[#fffdf9] p-4 transition-colors hover:bg-[#f7f0e8]"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f1eae2] text-[#75685f]"><Icon className="h-4 w-4" /></div><span className="flex-1 text-[12.5px] font-semibold text-[#51473f]">{label}</span><ArrowUpRight className="h-4 w-4 text-[#c0b3a9] group-hover:text-mahalyred" /></Link>;
}
