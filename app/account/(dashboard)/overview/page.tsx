import Link from "next/link";
import { redirect } from "next/navigation";
import { Package, CheckCircle2, XCircle } from "lucide-react";
import { requireUser } from "@/lib/supabase/accountAuth";
import { getOrdersForUser, getOrderStats } from "@/lib/data/orders";
import { getTrendingProducts } from "@/lib/data/collections";
import { getRecentlyViewedForUser } from "@/lib/data/recentlyViewed";
import { getFollowedBrandsForUser } from "@/lib/data/follows";
import ProductGrid from "@/components/category/ProductGrid";
import OrderCard from "@/components/account/OrderCard";
import FollowedBrandsRow from "@/components/account/FollowedBrandsRow";

export default async function AccountOverviewPage() {
  const user = await requireUser();
  if (!user) redirect("/account");

  const [orders, stats, continueShopping, recommended, followedBrands] = await Promise.all([
    getOrdersForUser(user.id),
    getOrderStats(user.id),
    getRecentlyViewedForUser(user.id, 4),
    getTrendingProducts(4),
    getFollowedBrandsForUser(user.id),
  ]);

  const recentOrders = orders.slice(0, 3);

  const statCards = [
    { label: "Total Orders", value: stats.total, icon: Package },
    { label: "Completed", value: stats.completed, icon: CheckCircle2 },
    { label: "Cancelled", value: stats.cancelled, icon: XCircle },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">Overview</h1>
      <p className="mt-1 text-[13.5px] text-ink-soft/60">
        A quick look at your account activity.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {statCards.map((stat) => (
          <div key={stat.label} className="rounded-xl3 border border-stone-150 bg-white p-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-beige-100">
              <stat.icon className="h-4 w-4 text-ink" strokeWidth={1.6} />
            </div>
            <p className="mt-4 text-2xl font-semibold text-ink">{stat.value}</p>
            <p className="text-[12.5px] font-medium text-ink-soft/60">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Recent Orders</h2>
          <Link
            href="/account/orders"
            className="text-[12.5px] font-medium text-ink-soft/70 hover:text-ink hover:underline"
          >
            View all →
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <p className="mt-4 text-[13px] text-ink-soft/60">
            No orders yet.{" "}
            <Link href="/shop/women" className="font-semibold text-ink hover:underline">
              Start shopping
            </Link>
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {recentOrders.map((order) => (
              <OrderCard key={order.id} order={order} showItems={false} />
            ))}
          </div>
        )}
      </div>

      {continueShopping.length > 0 && (
        <div className="mt-10">
          <h2 className="text-[15px] font-semibold text-ink">Continue Shopping</h2>
          <div className="mt-4">
            <ProductGrid products={continueShopping} viewMode="grid" />
          </div>
        </div>
      )}

      {recommended.length > 0 && (
        <div className="mt-10">
          <h2 className="text-[15px] font-semibold text-ink">Recommended For You</h2>
          <div className="mt-4">
            <ProductGrid products={recommended} viewMode="grid" />
          </div>
        </div>
      )}

      <FollowedBrandsRow brands={followedBrands} />
    </div>
  );
}
