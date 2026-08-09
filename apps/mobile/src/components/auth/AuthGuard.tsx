import { PropsWithChildren } from "react";
import type { Href } from "expo-router";
import { Redirect } from "expo-router";
import { LoadingState } from "@/components/system/States";
import { useAuth } from "@/providers/AuthProvider";
import { routes } from "@/navigation/routes";

export function AuthGuard({ children }: PropsWithChildren) {
  const { hasSession, isAuthenticated, isLoading, mfaStatus } = useAuth();
  if (isLoading) return <LoadingState label="Restoring your session…" />;
  if (hasSession && (mfaStatus === "required" || mfaStatus === "error")) {
    return <Redirect href={routes.mfa as Href} />;
  }
  if (!isAuthenticated) return <Redirect href={routes.signIn} />;
  return children;
}
