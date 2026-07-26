import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { getProfile, updateProfile } from "@/domain/profile";
import { useAppTheme } from "@/theme/ThemeProvider";

export default function ProfileSettingsRoute() {
  const router = useRouter(); const client = useQueryClient(); const { spacing } = useAppTheme(); const query = useQuery({ queryKey: ["profile"], queryFn: getProfile });
  if (!query.data) return <Screen><AppText>Loading profile…</AppText></Screen>;
  return <ProfileForm key={`${query.data.fullName}-${query.data.phone}`} profile={query.data} onDone={async () => { await client.invalidateQueries({ queryKey: ["profile"] }); router.back(); }} spacing={spacing.lg} />;
}
function ProfileForm({ profile, onDone, spacing }: { profile: Awaited<ReturnType<typeof getProfile>>; onDone: () => Promise<void>; spacing: number }) {
  const [fullName, setFullName] = useState(profile.fullName); const [phone, setPhone] = useState(profile.phone); const [busy, setBusy] = useState(false);
  return <Screen><Stack.Screen options={{ headerShown: true, title: "Personal information" }} /><AppText variant="display" style={{ marginVertical: spacing }}>Your details</AppText><TextField label="Full name" value={fullName} onChangeText={setFullName} /><TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><TextField label="Email" value={profile.email} editable={false} /><AppButton label="Save changes" loading={busy} onPress={async () => { setBusy(true); try { await updateProfile({ fullName, phone }); await onDone(); } finally { setBusy(false); } }} /></Screen>;
}
