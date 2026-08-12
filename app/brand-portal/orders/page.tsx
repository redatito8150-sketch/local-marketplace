import { redirect } from "next/navigation";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getOrdersForBrand } from "@/lib/data/brandPortal";
import { getAllBrandsForAdmin } from "@/lib/data/admin";
import BrandPicker from "@/components/brand-portal/BrandPicker";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import BrandOrdersWorkspace from "@/components/brand-portal/BrandOrdersWorkspace";
import { DashboardPageHeader } from "@/components/dashboard/DashboardUI";
import { belongsToBrandOrderQueue, filterBrandOrders, normalizeBrandOrderQueue, type BrandOrderQueue } from "@/lib/orders/brandOrderFilters";

type OrderParams = { brand?: string; q?: string; queue?: string; from?: string; to?: string; sort?: string; page?: string };

const PAGE_SIZE = 5;

export default async function BrandPortalOrdersPage(props: { searchParams: Promise<OrderParams> }) {
  const params = await props.searchParams;
  const owner = await requireBrandOwner(params.brand);
  if (!owner) redirect("/account");
  if (!owner.brandSlug) {
    const brands = await getAllBrandsForAdmin();
    return <BrandPicker brands={brands.map((brand) => ({ slug: brand.slug, name: brand.name }))} />;
  }

  const allOrders = await getOrdersForBrand(owner.brandSlug, owner.isImpersonating);
  const queue = normalizeBrandOrderQueue(params.queue);
  const counts: Record<BrandOrderQueue, number> = {
    all: allOrders.length,
    attention: allOrders.filter((order) => belongsToBrandOrderQueue(order, "attention")).length,
    active: allOrders.filter((order) => belongsToBrandOrderQueue(order, "active")).length,
    fulfilled: allOrders.filter((order) => belongsToBrandOrderQueue(order, "fulfilled")).length,
    cancelled: allOrders.filter((order) => belongsToBrandOrderQueue(order, "cancelled")).length,
  };

  const filtered = filterBrandOrders(allOrders, { ...params, queue });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const page = Math.min(requestedPage, totalPages);
  const orders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <DashboardPageHeader eyebrow="Sales operations" title="Orders" description="Track every order containing your variants, focus on the ones that need action, and inspect the full details without leaving the queue." />
      <BrandOrdersWorkspace
        orders={orders}
        counts={counts}
        brandSlug={owner.brandSlug}
        params={{ brand: owner.isImpersonating ? owner.brandSlug : undefined, q: params.q, queue, from: params.from, to: params.to, sort: params.sort }}
        page={page}
        totalPages={totalPages}
        totalOrders={filtered.length}
      />
    </div>
  );
}
