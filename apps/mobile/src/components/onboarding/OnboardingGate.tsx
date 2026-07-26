import AsyncStorage from "@react-native-async-storage/async-storage";
import { PropsWithChildren, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { LoadingState } from "@/components/system/States";
import { useAppTheme } from "@/theme/ThemeProvider";

const KEY = "mahaly_onboarding_complete_v1";
const pages = [
  { title: "Made nearby.\nChosen with care.", body: "Discover original pieces from independent Egyptian brands." },
  { title: "Know the story\nbehind the piece.", body: "Explore makers, materials and thoughtful local craftsmanship." },
  { title: "One Mahaly,\nwherever you shop.", body: "Your account, wishlist, addresses and orders stay connected." }
];

export function OnboardingGate({ children }: PropsWithChildren) {
  const { colors, spacing } = useAppTheme();
  const [ready, setReady] = useState(false); const [complete, setComplete] = useState(false); const [page, setPage] = useState(0);
  useEffect(() => { AsyncStorage.getItem(KEY).then((value) => setComplete(value === "true")).finally(() => setReady(true)); }, []);
  if (!ready) return <LoadingState label="Opening Mahaly…" />;
  if (complete) return children;
  const item = pages[page]!;
  const finish = async () => { await AsyncStorage.setItem(KEY, "true"); setComplete(true); };
  return <Screen><View style={{ flex: 1, justifyContent: "space-between", paddingVertical: spacing.xl }}>
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}><AppText variant="title">Mahaly</AppText><Pressable onPress={finish}><AppText variant="label" style={{ color: colors.textMuted }}>Skip</AppText></Pressable></View>
    <View style={{ gap: spacing.lg }}><View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: page === 1 ? colors.accent : colors.primary }} /><AppText variant="display">{item.title}</AppText><AppText style={{ color: colors.textMuted }}>{item.body}</AppText></View>
    <View style={{ gap: spacing.md }}><View style={{ flexDirection: "row", gap: spacing.xs }}>{pages.map((_, index) => <View key={index} style={{ width: index === page ? 24 : 8, height: 8, borderRadius: 4, backgroundColor: index === page ? colors.primary : colors.border }} />)}</View><AppButton label={page === pages.length - 1 ? "Start exploring" : "Continue"} onPress={() => page === pages.length - 1 ? finish() : setPage((value) => value + 1)} /></View>
  </View></Screen>;
}
