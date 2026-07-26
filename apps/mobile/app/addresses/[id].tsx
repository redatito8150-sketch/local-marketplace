import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { Address, AddressInput, getAddresses, updateAddress } from "@/domain/addresses";
import { useAppTheme } from "@/theme/ThemeProvider";

export default function EditAddressRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useQuery({ queryKey: ["addresses"], queryFn: getAddresses });
  const item = query.data?.find((address) => address.id === id);
  if (!item) {
    return <Screen><AppText>{query.isLoading ? "Loading address…" : "Address not found."}</AppText><AppButton label="Go back" onPress={() => router.back()} /></Screen>;
  }
  return <EditAddressForm key={item.id} item={item} />;
}

function EditAddressForm({ item }: { item: Address }) {
  const router = useRouter(); const client = useQueryClient(); const { spacing } = useAppTheme();
  const [form, setForm] = useState<AddressInput>({ label: item.label, firstName: item.firstName, lastName: item.lastName, phone: item.phone, addressLine: item.addressLine, city: item.city, governorate: item.governorate });
  const field = (key: keyof AddressInput, label: string) => <TextField label={label} value={form[key]} onChangeText={(value) => setForm((current) => ({ ...current, [key]: value }))} />;
  return <Screen scroll><Stack.Screen options={{ headerShown: true, title: "Edit address" }} /><AppText variant="display" style={{ marginVertical: spacing.lg }}>Edit address</AppText>{field("firstName", "First name")}{field("lastName", "Last name")}{field("phone", "Phone")}{field("addressLine", "Street and building")}{field("city", "City")}{field("governorate", "Governorate")}<AppButton label="Save changes" onPress={async () => { await updateAddress(item.id, form); await client.invalidateQueries({ queryKey: ["addresses"] }); router.back(); }} /></Screen>;
}
