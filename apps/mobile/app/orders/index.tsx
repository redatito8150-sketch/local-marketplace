import { useQuery } from "@tanstack/react-query";
import { Href, Stack, useRouter } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { ErrorState, LoadingState } from "@/components/system/States";
import { AppText } from "@/components/ui/AppText";
import { Badge, Card, EmptyState } from "@/components/ui/Primitives";
import { getOrders, statusLabel } from "@/domain/orders";
import { formatPrice } from "@/domain/products";
import { useAppTheme } from "@/theme/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";

export default function OrdersRoute() {
  const router = useRouter(); const auth = useAuth(); const { spacing } = useAppTheme();
  const query = useQuery({ queryKey: ["orders"], queryFn: getOrders, enabled: auth.isAuthenticated });
  return <AuthGuard><Stack.Screen options={{ headerShown: true, title: "Orders" }} />{query.isLoading ? <LoadingState /> : query.isError ? <ErrorState message="We couldn't load your orders." onRetry={() => query.refetch()} /> :
    <FlatList data={query.data ?? []} keyExtractor={(item) => item.id} refreshing={query.isRefetching} onRefresh={() => query.refetch()} contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, flexGrow: 1 }}
      ListHeaderComponent={<AppText variant="display" style={{ marginVertical: spacing.md }}>Your orders</AppText>}
      ListEmptyComponent={<EmptyState title="No orders yet" message="Your purchases will appear here." />}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Open order ${item.orderNumber}`} onPress={() => router.push(`/orders/${item.id}` as Href)}><Card><View style={{ gap: spacing.xs }}><View style={{ flexDirection: "row", justifyContent: "space-between" }}><AppText variant="label">#{item.orderNumber}</AppText><Badge tone={item.status === "fulfilled" ? "success" : item.status === "cancelled" ? "warning" : "neutral"}>{statusLabel[item.status]}</Badge></View><AppText variant="caption">{new Date(item.createdAt).toLocaleDateString("en-EG")} · {item.items.length} items</AppText>{item.subtotalEgp ? <AppText variant="label">{formatPrice(item.subtotalEgp - item.discountAmountEgp, "EGP")}</AppText> : null}</View></Card></Pressable>} />}
  </AuthGuard>;
}
