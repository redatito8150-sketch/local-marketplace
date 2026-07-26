import { PropsWithChildren } from "react";
import { Redirect } from "expo-router";
import { LoadingState } from "@/components/system/States";
import { useAuth } from "@/providers/AuthProvider";
import { routes } from "@/navigation/routes";

export function AuthGuard({ children }: PropsWithChildren) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingState label="Restoring your session…" />;
  if (!isAuthenticated) return <Redirect href={routes.signIn} />;
  return children;
}
