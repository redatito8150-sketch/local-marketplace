import { Stack } from "expo-router";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { Card } from "@/components/ui/Primitives";
import { Screen } from "@/components/ui/Screen";
import { ThemePreference, useAppTheme } from "@/theme/ThemeProvider";

const choices: { value: ThemePreference; label: string; description: string }[] = [
  { value: "system", label: "System", description: "Follow your device setting" },
  { value: "light", label: "Light", description: "Warm ivory and ink" },
  { value: "dark", label: "Dark", description: "Deep charcoal and soft cream" }
];
export default function AppearanceRoute() {
  const { colors, preference, setPreference, spacing } = useAppTheme();
  return <Screen><Stack.Screen options={{ headerShown: true, title: "Appearance" }} /><AppText variant="display" style={{ marginVertical: spacing.lg }}>Choose your look</AppText><View style={{ gap: spacing.sm }}>{choices.map((choice) => <Pressable key={choice.value} onPress={() => setPreference(choice.value)}><Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, borderColor: preference === choice.value ? colors.primary : colors.border }}><View style={{ flex: 1 }}><AppText variant="label">{choice.label}</AppText><AppText variant="caption" style={{ color: colors.textMuted }}>{choice.description}</AppText></View>{preference === choice.value ? <Ionicons name="checkmark-circle" size={24} color={colors.primary} /> : null}</Card></Pressable>)}</View></Screen>;
}
