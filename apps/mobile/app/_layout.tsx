import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppErrorBoundary, NetworkStatusBanner } from "@/components/system/States";
import { AuthProvider } from "@/providers/AuthProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import { CartProvider } from "@/providers/CartProvider";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";
import { ThemeProvider, useAppTheme } from "@/theme/ThemeProvider";

function RootNavigator() {
  const { colors, isDark } = useAppTheme();

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NetworkStatusBanner />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background }
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" options={{ presentation: "modal" }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppErrorBoundary>
          <QueryProvider>
            <AuthProvider>
              <CartProvider>
                <OnboardingGate>
                  <RootNavigator />
                </OnboardingGate>
              </CartProvider>
            </AuthProvider>
          </QueryProvider>
        </AppErrorBoundary>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
