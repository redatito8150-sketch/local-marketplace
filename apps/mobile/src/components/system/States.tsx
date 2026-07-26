import NetInfo from "@react-native-community/netinfo";
import { Component, ErrorInfo, PropsWithChildren, ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { useAppTheme } from "@/theme/ThemeProvider";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  const { colors, spacing } = useAppTheme();
  return (
    <View accessibilityRole="progressbar" style={[styles.center, { gap: spacing.sm }]}>
      <ActivityIndicator color={colors.primary} />
      <AppText style={{ color: colors.textMuted }}>{label}</AppText>
    </View>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  const { colors, spacing } = useAppTheme();
  return (
    <View style={[styles.center, { gap: spacing.sm }]}>
      <AppText variant="title" style={{ textAlign: "center" }}>{title}</AppText>
      <AppText style={{ color: colors.textMuted, textAlign: "center" }}>{message}</AppText>
      {onRetry ? <AppButton label="Try again" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function NetworkStatusBanner() {
  const { colors, spacing } = useAppTheme();
  const [offline, setOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((state) => setOffline(state.isConnected === false)), []);
  if (!offline) return null;
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: colors.warning, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
      <AppText variant="caption" style={{ color: colors.onPrimary, textAlign: "center" }}>You’re offline. Some information may be out of date.</AppText>
    </View>
  );
}

type BoundaryProps = PropsWithChildren<{ fallback?: ReactNode }>;
type BoundaryState = { hasError: boolean };

export class AppErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };
  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled mobile error", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <Screen>
          <ErrorState message="Please restart the app and try again." />
        </Screen>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }
});
