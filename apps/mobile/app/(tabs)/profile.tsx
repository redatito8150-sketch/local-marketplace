import { useQuery } from "@tanstack/react-query";
import { Href, useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { LoadingState } from "@/components/system/States";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Card, Divider } from "@/components/ui/Primitives";
import { Screen } from "@/components/ui/Screen";
import { getAddresses } from "@/domain/addresses";
import { getOrders } from "@/domain/orders";
import { getProfile } from "@/domain/profile";
import { getWishlist } from "@/domain/wishlist";
import { useAuth } from "@/providers/AuthProvider";
import { useAppTheme } from "@/theme/ThemeProvider";

const links = [
  ["Orders", "/orders", "bag-handle-outline"],
  ["Addresses", "/addresses", "location-outline"],
  ["Personal information", "/settings/profile", "person-outline"],
  ["Notifications", "/settings/notifications", "notifications-outline"],
  ["Appearance", "/settings/appearance", "contrast-outline"]
] as const;
export default function ProfileRoute() {
  const auth = useAuth(); const router = useRouter(); const { colors, spacing } = useAppTheme();
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile, enabled: auth.isAuthenticated });
  const orders = useQuery({ queryKey: ["orders"], queryFn: getOrders, enabled: auth.isAuthenticated });
  const wishlist = useQuery({ queryKey: ["wishlist"], queryFn: getWishlist, enabled: auth.isAuthenticated });
  const addresses = useQuery({ queryKey: ["addresses"], queryFn: getAddresses, enabled: auth.isAuthenticated });
  if (!auth.isAuthenticated) return <Screen><View style={{ flex: 1, justifyContent: "center", gap: spacing.md }}><AppText variant="display">Your Mahaly</AppText><AppText style={{ color: colors.textMuted }}>Sign in to see your orders, saved pieces and addresses.</AppText><AppButton label="Sign in" onPress={() => router.push("/sign-in")} /></View></Screen>;
  return <AuthGuard>{profile.isLoading ? <LoadingState /> : <Screen scroll><View style={{ gap: spacing.md, paddingVertical: spacing.lg }}><AppText variant="display">{profile.data?.fullName || "Your Mahaly"}</AppText><AppText style={{ color: colors.textMuted }}>{profile.data?.email}</AppText>
    <View style={{ flexDirection: "row", gap: spacing.sm }}><Card style={{ flex: 1 }}><AppText variant="title">{orders.data?.length ?? 0}</AppText><AppText variant="caption">Orders</AppText></Card><Card style={{ flex: 1 }}><AppText variant="title">{wishlist.data?.length ?? 0}</AppText><AppText variant="caption">Wishlist</AppText></Card><Card style={{ flex: 1 }}><AppText variant="title">{addresses.data?.length ?? 0}</AppText><AppText variant="caption">Addresses</AppText></Card></View>
    <Card style={{ gap: spacing.sm }}>{links.map((item, index) => <View key={item[0]}>{index ? <Divider /> : null}<Pressable onPress={() => router.push(item[1] as Href)} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm }}><Ionicons name={item[2]} size={21} color={colors.primary} /><AppText variant="label" style={{ flex: 1 }}>{item[0]}</AppText><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Pressable></View>)}</Card>
    <AppButton label="Sign out" variant="ghost" onPress={auth.signOut} />
  </View></Screen>}</AuthGuard>;
}
