import AddressForm from "@/components/account/AddressForm";
import { AccountPageHeader, AccountPanel } from "@/components/account/AccountUI";

export default function NewAddressPage() {
  return (
    <div className="space-y-7">
      <AccountPageHeader eyebrow="Delivery details" title="Add an address" description="Save a trusted delivery location for quicker checkout." />
      <AccountPanel><div className="p-5 sm:p-6"><AddressForm mode="create" /></div></AccountPanel>
    </div>
  );
}
