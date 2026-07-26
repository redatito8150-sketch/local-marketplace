import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Switch, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { Card } from "@/components/ui/Primitives";
import { Screen } from "@/components/ui/Screen";
import { getNotificationPreferences, NotificationPreferences, updateNotificationPreferences } from "@/domain/profile";
import { useAppTheme } from "@/theme/ThemeProvider";

export default function NotificationsRoute() {
  const query = useQuery({ queryKey: ["notification-preferences"], queryFn: getNotificationPreferences });
  if (!query.data) return <Screen><AppText>Loading preferences…</AppText></Screen>;
  return <PreferencesForm key={JSON.stringify(query.data)} initial={query.data} />;
}
function PreferencesForm({ initial }: { initial: NotificationPreferences }) {
  const client = useQueryClient(); const { colors, spacing } = useAppTheme(); const [value, setValue] = useState(initial);
  const change = async (key: keyof NotificationPreferences, enabled: boolean) => {
    const previous = value; const next = { ...value, [key]: enabled }; setValue(next);
    try { await updateNotificationPreferences(next); client.setQueryData(["notification-preferences"], next); } catch { setValue(previous); }
  };
  const rows: [keyof NotificationPreferences, string, string][] = [["orderUpdates", "Order updates", "Important changes to your purchases"], ["promotions", "Offers", "Occasional Mahaly promotions"], ["newsletter", "Journal", "Stories and new local collections"]];
  return <Screen><Stack.Screen options={{ headerShown: true, title: "Notifications" }} /><AppText variant="display" style={{ marginVertical: spacing.lg }}>Stay in the loop</AppText><Card>{rows.map(([key, label, description]) => <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm }}><View style={{ flex: 1 }}><AppText variant="label">{label}</AppText><AppText variant="caption" style={{ color: colors.textMuted }}>{description}</AppText></View><Switch value={value[key]} onValueChange={(enabled) => change(key, enabled)} trackColor={{ true: colors.primary }} /></View>)}</Card><AppText variant="caption" style={{ color: colors.textMuted, marginTop: spacing.md }}>Push notifications are not enabled because Mahaly does not currently have a configured mobile push provider.</AppText></Screen>;
}
