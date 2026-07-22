import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/accountAuth";
import { getAddressById } from "@/lib/data/addresses";
import AddressForm from "@/components/account/AddressForm";
import { AccountPageHeader, AccountPanel } from "@/components/account/AccountUI";

export default async function EditAddressPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await requireUser();
  if (!user) redirect("/account");

  const address = await getAddressById(user.id, params.id);
  if (!address) notFound();

  return (
    <div className="space-y-7">
      <AccountPageHeader eyebrow="Delivery details" title="Edit address" description={`Update the details saved as ${address.label}.`} />
      <AccountPanel><div className="p-5 sm:p-6"><AddressForm mode="edit" initial={address} /></div></AccountPanel>
    </div>
  );
}
