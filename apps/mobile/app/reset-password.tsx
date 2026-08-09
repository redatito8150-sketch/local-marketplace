import { useState } from "react";
import { Stack, useRouter } from "expo-router";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useAppTheme } from "@/theme/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";

export default function ResetPasswordRoute() {
  const auth = useAuth();
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const visibleMessage =
    message ||
    (!auth.isLoading && !auth.recoveryReady
      ? "This recovery link is incomplete, expired, or already used."
      : "");

  const updatePassword = async () => {
    setMessage("");
    try {
      await auth.completePasswordRecovery(password);
      router.replace("/(tabs)");
    } catch {
      setMessage("We couldn't update your password.");
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: "New password" }} />
      <AppText variant="display" style={{ marginVertical: spacing.lg }}>
        Choose a new password
      </AppText>
      <TextField
        kind="password"
        label="New password"
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
      />
      {visibleMessage ? (
        <AppText accessibilityRole="alert" style={{ color: colors.danger }}>
          {visibleMessage}
        </AppText>
      ) : null}
      <AppButton
        label="Update password"
        loading={auth.isLoading}
        disabled={!auth.isAuthenticated || !auth.recoveryReady || password.length < 8}
        onPress={updatePassword}
      />
    </Screen>
  );
}
