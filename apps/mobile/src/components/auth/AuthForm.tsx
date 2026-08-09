import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/providers/AuthProvider";
import { useAppTheme } from "@/theme/ThemeProvider";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" | "recovery" }) {
  const router = useRouter();
  const auth = useAuth();
  const { colors, spacing } = useAppTheme();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const submit = async () => {
    setMessage("");
    if (!email.trim() || (mode !== "recovery" && password.length < 8)) {
      setMessage("Enter a valid email and a password of at least 8 characters.");
      return;
    }
    if (mode === "sign-up" && !acceptedLegal) {
      setMessage("Accept the Terms and Privacy Policy to create an account.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "sign-in") {
        const destination = await auth.signIn(email.trim(), password);
        router.replace((destination === "mfa-required" ? "/mfa" : "/(tabs)") as Href);
        return;
      }
      if (mode === "sign-up") {
        const destination = await auth.signUp(email.trim(), password, name.trim(), "2026-08-10");
        if (destination === "confirmation-required") {
          setMessage("Check your email to confirm this account on this device.");
          return;
        }
        router.replace((destination === "mfa-required" ? "/mfa" : "/(tabs)") as Href);
        return;
      }
      await auth.recoverPassword(email.trim());
      setMessage("Check your email for a secure recovery link.");
    } catch {
      setMessage("We couldn't complete that request. Check your details and try again.");
    } finally {
      setBusy(false);
    }
  };
  const title = mode === "sign-in" ? "Welcome back" : mode === "sign-up" ? "Join Mahaly" : "Reset password";
  return (
    <Screen scroll keyboardShouldPersistTaps="handled">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "center", gap: spacing.md, paddingVertical: spacing.xl }}>
        <AppText variant="display">{title}</AppText>
        <AppText style={{ color: colors.textMuted }}>One account for Mahaly on web and mobile.</AppText>
        {mode === "sign-up" ? <TextField label="Name" value={name} onChangeText={setName} autoComplete="name" /> : null}
        <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        {mode !== "recovery" ? <TextField label="Password" kind="password" value={password} onChangeText={setPassword} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} /> : null}
        {mode === "sign-up" ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptedLegal }}
            onPress={() => setAcceptedLegal((value) => !value)}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
          >
            <AppText style={{ color: colors.primary }}>{acceptedLegal ? "☑" : "☐"}</AppText>
            <AppText style={{ flex: 1, color: colors.textMuted }}>I accept the Terms and Privacy Policy.</AppText>
          </Pressable>
        ) : null}
        {message ? <AppText accessibilityRole="alert" style={{ color: message.startsWith("Check") ? colors.success : colors.danger }}>{message}</AppText> : null}
        <AppButton label={mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create account" : "Send recovery link"} loading={busy} onPress={submit} />
        {mode === "sign-in" ? <View style={{ gap: spacing.xs }}><AppButton label="Forgot password?" variant="ghost" onPress={() => router.push("/password-recovery")} /><AppButton label="Create an account" variant="secondary" onPress={() => router.push("/sign-up")} /></View> : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}
