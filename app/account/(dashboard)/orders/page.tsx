import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/accountAuth";
import { getOrdersForUser } from "@/lib/data/orders";
import OrdersTabs from "@/components/account/OrdersTabs";
import { AccountPageHeader } from "@/components/account/AccountUI";

export default async function AccountOrdersPage() {
  const user = await requireUser();
  if (!user) redirect("/account");

  const orders = await getOrdersForUser(user.id);

  return (
    <div className="space-y-7">
      <AccountPageHeader eyebrow="Your purchases" title="Orders" description="Track current purchases and revisit everything you have ordered from Mahaly." />
      <div>
        <OrdersTabs orders={orders} />
      </div>
    </div>
  );
}
