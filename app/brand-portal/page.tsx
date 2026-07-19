import { redirect } from "next/navigation";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getOrdersForBrand, getVariantsForBrand } from "@/lib/data/brandPortal";
import { getAllBrandsForAdmin } from "@/lib/data/admin";
import { formatPrice } from "@/lib/format";
import BrandPicker from "@/components/brand-portal/BrandPicker";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";

export default async function BrandPortalOverviewPage({
  searchParams,
}: {
  searchParams: { brand?: string };
}) {
  const owner = await requireBrandOwner(searchParams.brand);
  if (!owner) redirect("/account");

  if (!owner.brandSlug) {
    const brands = await getAllBrandsForAdmin();
    return <BrandPicker brands={brands.map((b) => ({ slug: b.slug, name: b.name }))} />;
  }

  const [orders, variants] = await Promise.all([
    getOrdersForBrand(owner.brandSlug, owner.isImpersonating),
    getVariantsForBrand(owner.brandSlug, owner.isImpersonating),
  ]);

  const revenue = orders
    .filter((o) => o.status !== "cancelled")
    .reduce(
      (sum, o) =>
        sum + o.items.reduce((s, i) => (i.currency === "EGP" ? s + i.price * i.quantity : s), 0),
      0
    );
  const lowStockCount = variants.filter((v) => v.quantity <= v.lowStockThreshold).length;

  return (
    <div>
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <h1 className="text-2xl font-bold tracking-tightest text-ink">Overview</h1>
      <p className="mt-1 text-[13.5px] text-ink-soft/60">
        A quick look at your orders and stock on Local.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl3 border border-stone-150 bg-white p-5">
          <p className="text-[12.5px] font-medium text-ink-soft/60">Orders</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{orders.length}</p>
        </div>
        <div className="rounded-xl3 border border-stone-150 bg-white p-5">
          <p className="text-[12.5px] font-medium text-ink-soft/60">Revenue</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{formatPrice(revenue, "EGP")}</p>
        </div>
        <div className="rounded-xl3 border border-stone-150 bg-white p-5">
          <p className="text-[12.5px] font-medium text-ink-soft/60">Low Stock Variants</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{lowStockCount}</p>
        </div>
      </div>

      <p className="mt-8 rounded-md bg-stone-50 px-4 py-3 text-[12.5px] text-ink-soft/60">
        Orders placed before your portal access was linked won&apos;t appear here — only new
        orders going forward are attributed to your brand.
      </p>
    </div>
  );
}
