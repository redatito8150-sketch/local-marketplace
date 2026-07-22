import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/accountAuth";
import { getAddressesForUser } from "@/lib/data/addresses";
import AddressCard from "@/components/account/AddressCard";
import { AccountEmptyState, AccountPageHeader, accountPrimaryButton } from "@/components/account/AccountUI";

export default async function AccountAddressesPage() {
  const user = await requireUser();
  if (!user) redirect("/account");

  const addresses = await getAddressesForUser(user.id);

  return (
    <div className="space-y-7">
      <AccountPageHeader
        eyebrow="Delivery details"
        title="Saved addresses"
        description="Keep your delivery locations organized and choose the one you use most often."
        action={<Link
          href="/account/addresses/new"
          className={accountPrimaryButton}
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Add address
        </Link>}
      />

      {addresses.length === 0 ? (
        <AccountEmptyState title="No saved addresses" description="Add your first address to make checkout quicker next time." action={<Link href="/account/addresses/new" className={accountPrimaryButton}>Add your first address</Link>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {addresses.map((address) => (
            <AddressCard key={address.id} address={address} />
          ))}
        </div>
      )}
    </div>
  );
}
