import { useState } from "react";
import { Redirect, Stack, useRouter } from "expo-router";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { LoadingState } from "@/components/system/States";
import { routes } from "@/navigation/routes";
import { useAuth } from "@/providers/AuthProvider";
import { useAppTheme } from "@/theme/ThemeProvider";

export default function MfaRoute() {
  const auth = useAuth();
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (auth.isLoading) return <LoadingState label="Checking account security…" />;
  if (!auth.hasSession) return <Redirect href={routes.signIn} />;
  if (auth.isAuthenticated) {
    return <Redirect href={auth.recoveryReady ? routes.resetPassword : routes.home} />;
  }

  const verify = async () => {
    setMessage("");
    if (!/^\d{6}$/.test(code)) {
      setMessage("Enter the six-digit code from your authenticator app.");
      return;
    }

    setBusy(true);
    try {
      await auth.verifyMfa(code);
      router.replace(auth.recoveryReady ? routes.resetPassword : routes.home);
    } catch {
      setMessage("We couldn't verify that code. Check it and try again.");
    } finally {
      setBusy(false);
    }
  };

  const retrySecurityCheck = async () => {
    setMessage("");
    setBusy(true);
    try {
      await auth.refreshMfaStatus();
    } catch {
      setMessage("We couldn't check your account security. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: "Security check", gestureEnabled: false }} />
      <AppText variant="display" style={{ marginVertical: spacing.lg }}>
        Two-step verification
      </AppText>
      <AppText style={{ color: colors.textMuted, marginBottom: spacing.lg }}>
        Enter the code from the authenticator app linked to your account.
      </AppText>
      {auth.mfaStatus === "error" ? (
        <AppButton
          label="Check again"
          variant="secondary"
          loading={busy}
          onPress={retrySecurityCheck}
        />
      ) : (
        <>
          <TextField
            label="Authenticator code"
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
          />
          <AppButton
            label="Verify"
            loading={busy}
            disabled={code.length !== 6}
            style={{ marginTop: spacing.md }}
            onPress={verify}
          />
        </>
      )}
      {message ? (
        <AppText accessibilityRole="alert" style={{ color: colors.danger, marginTop: spacing.md }}>
          {message}
        </AppText>
      ) : null}
      <AppButton
        label="Sign out"
        variant="ghost"
        style={{ marginTop: spacing.md }}
        onPress={() => void auth.signOut().catch(() => undefined)}
      />
    </Screen>
  );
}
