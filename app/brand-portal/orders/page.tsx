import { redirect } from "next/navigation";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getOrdersForBrand } from "@/lib/data/brandPortal";
import { getAllBrandsForAdmin } from "@/lib/data/admin";
import { formatPrice, formatSize } from "@/lib/format";
import { ORDER_STATUS_LABELS, orderStatusBadgeClass } from "@/lib/admin/statuses";
import BrandPicker from "@/components/brand-portal/BrandPicker";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import type { OrderStatus } from "@/types";

export default async function BrandPortalOrdersPage(
  props: {
    searchParams: Promise<{ brand?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const owner = await requireBrandOwner(searchParams.brand);
  if (!owner) redirect("/account");

  if (!owner.brandSlug) {
    const brands = await getAllBrandsForAdmin();
    return <BrandPicker brands={brands.map((b) => ({ slug: b.slug, name: b.name }))} />;
  }

  const orders = await getOrdersForBrand(owner.brandSlug, owner.isImpersonating);

  return (
    <div>
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <h1 className="text-2xl font-bold tracking-tightest text-ink">
        Orders ({orders.length})
      </h1>

      <div className="mt-8 space-y-4">
        {orders.map((order) => (
          <div key={order.id} className="rounded-xl3 border border-stone-150 bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[13.5px] font-semibold text-ink">#{order.orderNumber}</p>
                <p className="text-[12px] text-ink-soft/50">
                  {order.shippingCity}, {order.shippingGovernorate} ·{" "}
                  {new Date(order.createdAt).toLocaleDateString("en-US")}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${orderStatusBadgeClass(
                  order.status
                )}`}
              >
                {ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}
              </span>
            </div>
            <div className="mt-3 divide-y divide-stone-150 border-t border-stone-150 pt-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2 first:pt-0">
                  <p className="text-[13px] text-ink-soft/75">
                    {item.name} · Qty {item.quantity} · {formatSize(item.size)}
                    {item.color ? ` · ${item.color}` : ""}
                  </p>
                  <p className="text-[13px] font-medium text-ink">
                    {formatPrice(item.price * item.quantity, item.currency)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}

        {orders.length === 0 && (
          <p className="rounded-xl3 border border-stone-150 bg-white px-5 py-10 text-center text-sm text-ink-soft/60">
            No orders yet.
          </p>
        )}
      </div>
    </div>
  );
}
