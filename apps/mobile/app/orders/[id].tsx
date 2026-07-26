import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { ErrorState, LoadingState } from "@/components/system/States";
import { AppText } from "@/components/ui/AppText";
import { Badge, Card } from "@/components/ui/Primitives";
import { Screen } from "@/components/ui/Screen";
import { getOrder, statusLabel } from "@/domain/orders";
import { formatPrice } from "@/domain/products";
import { useAppTheme } from "@/theme/ThemeProvider";

export default function OrderDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { colors, radius, spacing } = useAppTheme();
  const query = useQuery({ queryKey: ["orders", id], queryFn: () => getOrder(id), enabled: Boolean(id) });
  return <AuthGuard><Stack.Screen options={{ headerShown: true, title: "Order details" }} />{query.isLoading ? <LoadingState /> : query.isError ? <ErrorState message="This order is unavailable." onRetry={() => query.refetch()} /> : query.data ? <Screen scroll>
    <View style={{ gap: spacing.md, paddingVertical: spacing.lg }}><AppText variant="display">Order #{query.data.orderNumber}</AppText><Badge tone={query.data.status === "fulfilled" ? "success" : "neutral"}>{statusLabel[query.data.status]}</Badge><AppText>{new Date(query.data.createdAt).toLocaleString("en-EG")}</AppText>
      {query.data.items.map((item) => <Card key={item.id} style={{ flexDirection: "row", gap: spacing.sm }}><Image source={item.image} alt={item.name} style={{ width: 72, height: 90, borderRadius: radius.sm, backgroundColor: colors.skeleton }} /><View style={{ flex: 1 }}><AppText variant="caption">{item.brand}</AppText><AppText variant="label">{item.name}</AppText><AppText variant="caption">{[item.color, item.size].filter(Boolean).join(" · ")} · Qty {item.quantity}</AppText><AppText>{formatPrice(item.price * item.quantity, item.currency)}</AppText></View></Card>)}
      <Card><AppText variant="title">Delivery</AppText><AppText>{query.data.shippingName}</AppText><AppText>{query.data.shippingAddress}, {query.data.shippingCity}, {query.data.shippingGovernorate}</AppText><AppText>{query.data.shippingPhone}</AppText></Card>
    </View></Screen> : null}</AuthGuard>;
}
