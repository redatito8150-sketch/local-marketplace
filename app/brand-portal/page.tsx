import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Eye,
  Package,
  Plus,
  ReceiptText,
  ShoppingBag,
} from "lucide-react";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getOrdersForBrand, getProductsForBrand, getVariantsForBrand } from "@/lib/data/brandPortal";
import { getAllBrandsForAdmin, getAuditLogsForBrand } from "@/lib/data/admin";
import { getBestSellingProductsForBrand } from "@/lib/data/collections";
import { formatDateOnly, formatDateTime, formatPrice } from "@/lib/format";
import { describeAuditLog } from "@/lib/auditLogDescribe";
import BrandPicker from "@/components/brand-portal/BrandPicker";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import {
  DashboardEmptyState,
  DashboardPageHeader,
  DashboardPanel,
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

  const [orders, variants, products, bestSellers, activity] = await Promise.all([
    getOrdersForBrand(owner.brandSlug, owner.isImpersonating),
    getVariantsForBrand(owner.brandSlug, owner.isImpersonating),
    getProductsForBrand(owner.brandId!, owner.isImpersonating),
    getBestSellingProductsForBrand(owner.brandSlug, 4),
    owner.accessLevel === "owner" ? getAuditLogsForBrand(owner.brandSlug, 6) : Promise.resolve([]),
  ]);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const validOrders = orders.filter((order) => order.status !== "cancelled");
  const orderRevenue = (order: (typeof orders)[number]) =>
    order.items.reduce((sum, item) => (item.currency === "EGP" ? sum + item.price * item.quantity : sum), 0);
  const monthOrders = validOrders.filter((order) => new Date(order.createdAt) >= startOfMonth);
  const salesToday = validOrders
    .filter((order) => new Date(order.createdAt) >= startOfToday)
    .reduce((sum, order) => sum + orderRevenue(order), 0);
  const salesMonth = monthOrders.reduce((sum, order) => sum + orderRevenue(order), 0);
  const averageOrderValue = monthOrders.length ? salesMonth / monthOrders.length : 0;
  const ordersToday = validOrders.filter((order) => new Date(order.createdAt) >= startOfToday).length;
  const pendingOrders = orders.filter((order) => order.status === "pending");
  const lowStock = variants.filter((variant) => variant.quantity > 0 && variant.quantity <= variant.lowStockThreshold);
  const outOfStock = variants.filter((variant) => variant.quantity <= 0);
  const healthyStock = Math.max(variants.length - lowStock.length - outOfStock.length, 0);
  const pendingProducts = products.filter(
    (product) => product.status === "pending_review" || product.status === "changes_requested" || product.hasPendingEdit
  );
  const publishedProducts = products.filter((product) => product.status === "published").length;
  const brandParam = owner.isImpersonating ? `?brand=${owner.brandSlug}` : "";
  const pendingActions = pendingOrders.length + lowStock.length + outOfStock.length + pendingProducts.length;
  const attentionHref = pendingOrders.length
    ? `/brand-portal/orders${brandParam}`
    : lowStock.length || outOfStock.length
      ? `/brand-portal/stock${brandParam}`
      : `/brand-portal/products${brandParam}`;

  return (
    <div className="mx-auto max-w-[1540px] space-y-7 pb-3 text-[#242424] sm:space-y-8">
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}

      <DashboardPageHeader
        eyebrow="Overview"
        title={`Welcome back${owner.brandName ? `, ${owner.brandName}` : ""}`}
        description="Track your business, handle urgent work, and keep your catalog ready for customers."
        actions={
          <>
            <Link href={`/brand-portal/products/new${brandParam}`} className={`${dashboardButtonPrimary} active:translate-y-px`}>
              <Plus className="mr-2 h-4 w-4" />
              Add product
            </Link>
            <Link
              href={`/brands/${owner.brandSlug}`}
              target="_blank"
              rel="noreferrer"
              className={`${dashboardButtonSecondary} border-[#ddd6cd] bg-[#fffdf9] text-[#51473f] hover:bg-[#f7f0e8] active:translate-y-px`}
            >
              <Eye className="mr-2 h-4 w-4" />
              View storefront
            </Link>
          </>
        }
      />

      <section aria-labelledby="performance-heading">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="performance-heading" className="text-[17px] font-bold tracking-[-0.02em] text-[#332c27]">Business performance</h2>
            <p className="mt-1 text-[13px] text-[#81746a]">A concise view of this month and today.</p>
          </div>
          <Link
            href={attentionHref}
            aria-label={pendingActions ? `${pendingActions} items need attention` : "Everything is up to date"}
            className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 ${pendingActions ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"}`}
          >
            {pendingActions ? <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} /> : <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />}
            <span className="tabular-nums">{pendingActions ? `${pendingActions} need attention` : "All up to date"}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid gap-4 tabular-nums sm:grid-cols-2 xl:grid-cols-[1.25fr_repeat(3,minmax(0,1fr))]">
          <OverviewMetricCard
            label="Sales this month"
            value={formatPrice(salesMonth, "EGP")}
            detail={`${formatPrice(salesToday, "EGP")} today`}
            icon={CircleDollarSign}
            tone="brand"
          />
          <OverviewMetricCard
            label="Orders today"
            value={ordersToday}
            detail={`${monthOrders.length} this month`}
            icon={ShoppingBag}
            tone="warm"
            href={`/brand-portal/orders${brandParam}`}
          />
          <OverviewMetricCard
            label="Published products"
            value={publishedProducts}
            detail={`${products.length} total products`}
            icon={Package}
            tone="neutral"
            href={`/brand-portal/products${brandParam}`}
          />
          <OverviewMetricCard
            label="Average order value"
            value={formatPrice(averageOrderValue, "EGP")}
            detail={monthOrders.length ? "Based on this month" : "No orders this month"}
            icon={ReceiptText}
            tone="success"
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.45fr)]">
        <DashboardPanel
          title="Recent orders"
          description="The latest orders containing products from your brand"
          action={<Link href={`/brand-portal/orders${brandParam}`} className="text-[12.5px] font-semibold text-mahalyred hover:underline">View all orders</Link>}
          className="border-[#e3dcd3] bg-[#fffdf9] shadow-[0_10px_30px_rgba(67,45,29,0.045)]"
        >
          {orders.length ? (
            <div className="divide-y divide-[#eee7de]">
              {orders.slice(0, 6).map((order) => (
                <article key={order.id} className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-[#fbf8f4] sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-bold tabular-nums text-[#332c27]">#{order.orderNumber}</p>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#81746a]">
                      <span>{order.shippingName}</span>
                      <span>{order.shippingCity}</span>
                      <time dateTime={order.createdAt}>{formatDateOnly(order.createdAt)}</time>
                    </div>
                  </div>
                  <div className="flex flex-none items-center justify-between gap-3 sm:justify-end">
                    <p className="text-[13.5px] font-bold tabular-nums text-[#332c27]">{formatPrice(orderRevenue(order), "EGP")}</p>
                    <span className={`rounded-lg px-2.5 py-1 text-[10.5px] font-bold ${orderStatusBadgeClass(order.status as never)}`}>
                      {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ?? order.status}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <DashboardEmptyState title="No orders yet" description="Orders containing your products will appear here." />
          )}
        </DashboardPanel>

        <DashboardPanel
          title="Inventory health"
          description={`${variants.length} tracked variants`}
          action={<Link href={`/brand-portal/stock${brandParam}`} className="text-[12.5px] font-semibold text-mahalyred hover:underline">Manage</Link>}
          className="border-[#e3dcd3] bg-[#fffdf9] shadow-[0_10px_30px_rgba(67,45,29,0.045)]"
        >
          <div className="p-5 sm:p-6">
            <InventoryStatusRow label="Healthy stock" count={healthyStock} tone="success" />
            <InventoryStatusRow label="Low stock" count={lowStock.length} tone="warning" />
            <InventoryStatusRow label="Out of stock" count={outOfStock.length} tone="danger" />
            <Link
              href={`/brand-portal/stock${brandParam}`}
              className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#ddd6cd] bg-white text-[12.5px] font-semibold text-[#51473f] transition-colors hover:bg-[#f7f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 active:translate-y-px"
            >
              Open inventory <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </DashboardPanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <DashboardPanel
          title="Best-selling products"
          description="Ranked from real order quantities"
          action={<Link href={`/brand-portal/products${brandParam}`} className="text-[12.5px] font-semibold text-mahalyred hover:underline">View products</Link>}
          className="border-[#e3dcd3] bg-[#fffdf9] shadow-[0_10px_30px_rgba(67,45,29,0.045)]"
        >
          {bestSellers.length ? (
            <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
              {bestSellers.map((product, index) => (
                <Link
                  key={product.id}
                  href={`/product/${product.id}`}
                  className="group flex min-w-0 items-center gap-3 rounded-xl bg-[#f7f1eb] p-3 transition-colors hover:bg-[#f1e7de] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25"
                >
                  <div className="relative h-16 w-14 flex-none overflow-hidden rounded-lg bg-[#eee7de]">
                    <Image src={product.image} alt={product.name} fill sizes="56px" className="object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#9a8c81]">#{index + 1}</p>
                    <p className="mt-1 truncate text-[13px] font-bold text-[#332c27]">{product.name}</p>
                    <p className="mt-1 text-[12px] font-medium tabular-nums text-[#75685f]">{formatPrice(product.price, product.currency)}</p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 flex-none text-[#b7aaa0] transition-colors group-hover:text-mahalyred" />
                </Link>
              ))}
            </div>
          ) : (
            <DashboardEmptyState title="No sales ranking yet" description="Published products will appear here until sales data becomes available." />
          )}
        </DashboardPanel>

        <DashboardPanel
          title="Recent activity"
          description="Product and profile changes"
          action={owner.accessLevel === "owner" ? <Link href={`/brand-portal/logs${brandParam}`} className="text-[12.5px] font-semibold text-mahalyred hover:underline">View activity</Link> : undefined}
          className="border-[#e3dcd3] bg-[#fffdf9] shadow-[0_10px_30px_rgba(67,45,29,0.045)]"
        >
          {activity.length ? (
            <div className="divide-y divide-[#eee7de]">
              {activity.slice(0, 5).map((log) => (
                <article key={log.id} className="flex gap-3 px-5 py-4 sm:px-6">
                  <div className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#f1eae2] text-[#75685f]">
                    <Clock3 className="h-4 w-4" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] leading-5 text-[#51473f]">{describeAuditLog(log)}</p>
                    <time dateTime={log.createdAt} className="mt-1 block text-[11.5px] text-[#9b8e84]">{formatDateTime(log.createdAt)}</time>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <DashboardEmptyState
              title={owner.accessLevel === "owner" ? "No activity recorded yet" : "Activity is owner-only"}
              description={owner.accessLevel === "owner" ? "Product and brand changes will appear here." : "Your brand owner can review the complete activity log."}
            />
          )}
        </DashboardPanel>
      </div>

      <p className="rounded-xl border border-[#e3dcd3] bg-[#fffdf9] px-4 py-3 text-[12px] leading-5 text-[#7b6f66]">
        Orders placed before brand attribution was introduced may not appear here. All figures above use real attributed orders and catalog data.
      </p>
    </div>
  );
}

function OverviewMetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  href,
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
  icon: React.ElementType;
  tone: "brand" | "warm" | "neutral" | "success";
  href?: string;
}) {
  const tones = {
    brand: "bg-[#f8e8e6] text-mahalyred",
    warm: "bg-[#f3eadf] text-[#82623f]",
    neutral: "bg-[#eee9e4] text-[#6f6259]",
    success: "bg-emerald-50 text-emerald-700",
  };
  const content = (
    <div className="group h-full rounded-2xl border border-[#e3dcd3] bg-[#fffdf9] p-5 shadow-[0_10px_30px_rgba(67,45,29,0.045)] transition-all hover:-translate-y-0.5 hover:border-[#d5c9bd] hover:shadow-[0_16px_36px_rgba(67,45,29,0.075)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </div>
        {href && <ArrowUpRight className="h-4 w-4 text-[#c0b3a9] transition-colors group-hover:text-mahalyred" />}
      </div>
      <p className="mt-5 text-[12px] font-semibold text-[#81746a]">{label}</p>
      <div className="mt-1.5 text-[26px] font-bold tracking-[-0.04em] text-[#242424]">{value}</div>
      <p className="mt-2 text-[12.5px] leading-5 text-[#81746a]">{detail}</p>
    </div>
  );

  return href ? <Link href={href} className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/30">{content}</Link> : content;
}

function InventoryStatusRow({ label, count, tone }: { label: string; count: number; tone: "success" | "warning" | "danger" }) {
  const tones = {
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-mahalyred",
  };

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#eee7de] py-3 first:pt-0 last:border-b-0">
      <div className="flex items-center gap-3">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
          {tone === "success" ? <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} /> : <AlertTriangle className="h-4 w-4" strokeWidth={1.8} />}
        </span>
        <span className="text-[13px] font-medium text-[#51473f]">{label}</span>
      </div>
      <span className="text-[15px] font-bold tabular-nums text-[#332c27]">{count}</span>
    </div>
  );
}
