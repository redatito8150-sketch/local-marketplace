import type { Href } from "expo-router";
import { Redirect, useLocalSearchParams } from "expo-router";
import { ErrorState, LoadingState } from "@/components/system/States";
import { Screen } from "@/components/ui/Screen";
import { routes } from "@/navigation/routes";
import { useAuth } from "@/providers/AuthProvider";

export default function MobileAuthCallbackRoute() {
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const auth = useAuth();

  if (auth.isLoading) return <LoadingState label="Verifying the secure link…" />;
  if (auth.hasSession && (auth.mfaStatus === "required" || auth.mfaStatus === "error")) {
    return <Redirect href={routes.mfa as Href} />;
  }
  if (flow === "recovery" && auth.recoveryReady && auth.isAuthenticated) {
    return <Redirect href={routes.resetPassword} />;
  }
  if (flow === "signup" && auth.isAuthenticated) {
    return <Redirect href={routes.home} />;
  }

  return (
    <Screen>
      <ErrorState
        title="Link unavailable"
        message="This link is invalid, expired, already used, or was requested on another device. Request a new link from this device."
      />
    </Screen>
  );
}
