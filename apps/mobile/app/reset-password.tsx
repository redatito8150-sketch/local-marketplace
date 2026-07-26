import { useState } from "react";
import { Stack, useRouter } from "expo-router";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { supabase } from "@/lib/supabase/client";
import { useAppTheme } from "@/theme/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";

export default function ResetPasswordRoute() {
  const auth = useAuth(); const router = useRouter(); const { colors, spacing } = useAppTheme();
  const [password, setPassword] = useState(""); const [message, setMessage] = useState("");
  const visibleMessage = message || (!auth.isLoading && !auth.isAuthenticated ? "This recovery link is incomplete or expired." : "");
  return <Screen><Stack.Screen options={{ headerShown: true, title: "New password" }} /><AppText variant="display" style={{ marginVertical: spacing.lg }}>Choose a new password</AppText><TextField kind="password" label="New password" value={password} onChangeText={setPassword} />{visibleMessage ? <AppText style={{ color: colors.danger }}>{visibleMessage}</AppText> : null}<AppButton label="Update password" loading={auth.isLoading} disabled={!auth.isAuthenticated || password.length < 8} onPress={async () => { const { error } = await supabase.auth.updateUser({ password }); if (error) setMessage("We couldn't update your password."); else router.replace("/(tabs)"); }} /></Screen>;
}
