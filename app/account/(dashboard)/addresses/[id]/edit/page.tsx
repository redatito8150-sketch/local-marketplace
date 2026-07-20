import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/accountAuth";
import { getAddressById } from "@/lib/data/addresses";
import AddressForm from "@/components/account/AddressForm";

export default async function EditAddressPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user) redirect("/account");

  const address = await getAddressById(user.id, params.id);
  if (!address) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">Edit Address</h1>
      <div className="mt-8">
        <AddressForm mode="edit" initial={address} />
      </div>
    </div>
  );
}
