import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/accountAuth";
import { getAddressesForUser } from "@/lib/data/addresses";
import AddressCard from "@/components/account/AddressCard";

export default async function AccountAddressesPage() {
  const user = await requireUser();
  if (!user) redirect("/account");

  const addresses = await getAddressesForUser(user.id);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-ink">Addresses</h1>
          <p className="mt-1 text-[13.5px] text-ink-soft/60">
            Manage the addresses used at checkout.
          </p>
        </div>
        <Link
          href="/account/addresses/new"
          className="flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02]"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Add Address
        </Link>
      </div>

      {addresses.length === 0 ? (
        <p className="mt-8 text-[13px] text-ink-soft/60">
          No saved addresses yet. Add one to speed up checkout.
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {addresses.map((address) => (
            <AddressCard key={address.id} address={address} />
          ))}
        </div>
      )}
    </div>
  );
}
