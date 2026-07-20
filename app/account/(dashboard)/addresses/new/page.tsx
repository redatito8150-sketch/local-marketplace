import AddressForm from "@/components/account/AddressForm";

export default function NewAddressPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">Add Address</h1>
      <div className="mt-8">
        <AddressForm mode="create" />
      </div>
    </div>
  );
}
