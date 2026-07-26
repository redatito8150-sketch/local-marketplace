import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { useAppTheme } from "@/theme/ThemeProvider";

export default function OrderSuccessRoute() {
  const { orderNumber } = useLocalSearchParams<{ orderNumber: string }>();
  const router = useRouter(); const { colors, spacing } = useAppTheme();
  return <Screen><Stack.Screen options={{ headerShown: false }} /><View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md }}>
    <Ionicons name="bag-check-outline" size={72} color={colors.success} />
    <AppText variant="display" style={{ textAlign: "center" }}>Order placed successfully</AppText>
    <AppText style={{ color: colors.textMuted, textAlign: "center" }}>Your Mahaly order #{orderNumber} is confirmed by the server.</AppText>
    <AppButton label="Continue shopping" onPress={() => router.replace("/(tabs)")} />
  </View></Screen>;
}
