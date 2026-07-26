import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Href, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { ErrorState, LoadingState } from "@/components/system/States";
import { AppText } from "@/components/ui/AppText";
import { AppButton } from "@/components/ui/AppButton";
import { Badge, Card, Divider } from "@/components/ui/Primitives";
import { Screen } from "@/components/ui/Screen";
import { getOrder, statusLabel } from "@/domain/orders";
import { formatPrice } from "@/domain/products";
import { useAppTheme } from "@/theme/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";

export default function OrderDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter(); const auth = useAuth(); const { colors, radius, spacing } = useAppTheme();
  const query = useQuery({ queryKey: ["orders", id], queryFn: () => getOrder(id), enabled: Boolean(id) && auth.isAuthenticated });
  const statusSteps = ["pending", "paid", "shipped", "fulfilled"] as const;
  const currentStep = query.data ? statusSteps.indexOf(query.data.status as typeof statusSteps[number]) : -1;
  return <AuthGuard><Stack.Screen options={{ headerShown: true, title: "Order details" }} />{query.isLoading ? <LoadingState /> : query.isError ? <ErrorState message="This order is unavailable." onRetry={() => query.refetch()} /> : query.data ? <Screen scroll>
    <View style={{ gap: spacing.md, paddingVertical: spacing.lg }}><AppText variant="display">Order #{query.data.orderNumber}</AppText><Badge tone={query.data.status === "fulfilled" ? "success" : "neutral"}>{statusLabel[query.data.status]}</Badge><AppText>{new Date(query.data.createdAt).toLocaleString("en-EG")}</AppText>
      {query.data.status !== "cancelled" ? <View accessibilityLabel={`Order status: ${statusLabel[query.data.status]}`} style={{ flexDirection: "row", alignItems: "center" }}>{statusSteps.map((step, index) => <View key={step} style={{ flex: index === statusSteps.length - 1 ? 0 : 1, flexDirection: "row", alignItems: "center" }}><View style={{ width: 14, height: 14, borderRadius: 99, backgroundColor: index <= currentStep ? colors.success : colors.border }} />{index < statusSteps.length - 1 ? <View style={{ height: 2, flex: 1, backgroundColor: index < currentStep ? colors.success : colors.border }} /> : null}</View>)}</View> : null}
      {query.data.items.map((item) => <Card key={item.id} style={{ gap: spacing.sm }}><View style={{ flexDirection: "row", gap: spacing.sm }}><Image source={item.image} alt={item.name} style={{ width: 72, height: 90, borderRadius: radius.sm, backgroundColor: colors.skeleton }} /><View style={{ flex: 1 }}><AppText variant="caption">{item.brand}</AppText><AppText variant="label">{item.name}</AppText><AppText variant="caption">{[item.color, item.size].filter(Boolean).join(" · ")} · Qty {item.quantity}</AppText><AppText>{formatPrice(item.price * item.quantity, item.currency)}</AppText></View></View>{query.data.status === "fulfilled" && item.productId ? <AppButton label="Write review" variant="secondary" onPress={() => router.push(`/reviews/write?productId=${encodeURIComponent(item.productId!)}` as Href)} /> : null}</Card>)}
      <Card><AppText variant="title">Delivery</AppText><AppText>{query.data.shippingName}</AppText><AppText>{query.data.shippingAddress}, {query.data.shippingCity}, {query.data.shippingGovernorate}</AppText><AppText>{query.data.shippingPhone}</AppText></Card>
      <Card style={{ gap: spacing.sm }}><AppText variant="title">Order summary</AppText>{query.data.subtotalEgp ? <><View style={{ flexDirection: "row", justifyContent: "space-between" }}><AppText>Subtotal</AppText><AppText>{formatPrice(query.data.subtotalEgp, "EGP")}</AppText></View>{query.data.discountAmountEgp ? <View style={{ flexDirection: "row", justifyContent: "space-between" }}><AppText>Discount</AppText><AppText style={{ color: colors.success }}>-{formatPrice(query.data.discountAmountEgp, "EGP")}</AppText></View> : null}<Divider /><View style={{ flexDirection: "row", justifyContent: "space-between" }}><AppText variant="label">Total</AppText><AppText variant="label">{formatPrice(query.data.subtotalEgp - query.data.discountAmountEgp, "EGP")}</AppText></View></> : null}{query.data.subtotalUsd ? <View style={{ flexDirection: "row", justifyContent: "space-between" }}><AppText variant="label">USD total</AppText><AppText variant="label">{formatPrice(query.data.subtotalUsd, "USD")}</AppText></View> : null}</Card>
    </View></Screen> : null}</AuthGuard>;
}
