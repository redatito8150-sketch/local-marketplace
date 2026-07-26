import { useEffect, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { supabase } from "@/lib/supabase/client";
import { useAppTheme } from "@/theme/ThemeProvider";

export default function ResetPasswordRoute() {
  const { code } = useLocalSearchParams<{ code?: string }>(); const router = useRouter(); const { colors, spacing } = useAppTheme();
  const [password, setPassword] = useState(""); const [ready, setReady] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => {
    if (!code) return;
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => { setMessage(error ? "This recovery link is invalid or expired." : ""); setReady(!error); });
  }, [code]);
  const visibleMessage = message || (!code ? "This recovery link is incomplete or expired." : "");
  return <Screen><Stack.Screen options={{ headerShown: true, title: "New password" }} /><AppText variant="display" style={{ marginVertical: spacing.lg }}>Choose a new password</AppText><TextField kind="password" label="New password" value={password} onChangeText={setPassword} />{visibleMessage ? <AppText style={{ color: colors.danger }}>{visibleMessage}</AppText> : null}<AppButton label="Update password" disabled={!ready || password.length < 8} onPress={async () => { const { error } = await supabase.auth.updateUser({ password }); if (error) setMessage("We couldn't update your password."); else router.replace("/(tabs)"); }} /></Screen>;
}
