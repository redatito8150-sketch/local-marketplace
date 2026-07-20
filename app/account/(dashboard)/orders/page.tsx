import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/accountAuth";
import { getOrdersForUser } from "@/lib/data/orders";
import OrdersTabs from "@/components/account/OrdersTabs";

export default async function AccountOrdersPage() {
  const user = await requireUser();
  if (!user) redirect("/account");

  const orders = await getOrdersForUser(user.id);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">Orders</h1>
      <p className="mt-1 text-[13.5px] text-ink-soft/60">
        Track and review your order history.
      </p>

      <div className="mt-8">
        <OrdersTabs orders={orders} />
      </div>
    </div>
  );
}
