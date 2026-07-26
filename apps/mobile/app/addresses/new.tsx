import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { createAddress } from "@/domain/addresses";
import { useAppTheme } from "@/theme/ThemeProvider";

export default function NewAddressRoute() {
  const router = useRouter(); const client = useQueryClient(); const { colors, spacing } = useAppTheme();
  const [form, setForm] = useState({ label: "Home" as const, firstName: "", lastName: "", phone: "", addressLine: "", city: "", governorate: "" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const field = (key: keyof typeof form, label: string) => <TextField label={label} value={form[key]} onChangeText={(value) => setForm((current) => ({ ...current, [key]: value }))} />;
  return <Screen scroll keyboardShouldPersistTaps="handled"><Stack.Screen options={{ headerShown: true, title: "New address" }} /><AppText variant="display" style={{ marginVertical: spacing.lg }}>Delivery address</AppText>
    {field("firstName", "First name")}{field("lastName", "Last name")}{field("phone", "Phone")}{field("addressLine", "Street and building")}{field("city", "City")}{field("governorate", "Governorate")}
    {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}
    <AppButton label="Save address" loading={busy} onPress={async () => { setBusy(true); setError(""); try { await createAddress(form); await client.invalidateQueries({ queryKey: ["addresses"] }); router.back(); } catch { setError("Check the address and try again."); } finally { setBusy(false); } }} />
  </Screen>;
}
