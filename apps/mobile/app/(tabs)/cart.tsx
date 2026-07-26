import { Image } from "expo-image";
import { Href, useRouter } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { EmptyState, QuantitySelector } from "@/components/ui/Primitives";
import { formatPrice } from "@/domain/products";
import { useCart } from "@/providers/CartProvider";
import { useAppTheme } from "@/theme/ThemeProvider";

export default function CartRoute() {
  const cart = useCart();
  const router = useRouter();
  const { colors, radius, spacing } = useAppTheme();
  const egp = cart.items.filter((item) => item.currency === "EGP").reduce((sum, item) => sum + item.price * item.quantity, 0);
  const usd = cart.items.filter((item) => item.currency === "USD").reduce((sum, item) => sum + item.price * item.quantity, 0);
  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, flexGrow: 1 }}
      data={cart.items}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={<AppText variant="display" style={{ marginVertical: spacing.md }}>My cart</AppText>}
      ListEmptyComponent={<EmptyState title="Your cart is empty" message="Pieces you select will wait for you here." actionLabel="Start shopping" onAction={() => router.push("/(tabs)")} />}
      renderItem={({ item }) => (
        <View style={{ flexDirection: "row", gap: spacing.sm, backgroundColor: colors.surfaceRaised, borderRadius: radius.md, padding: spacing.sm }}>
          <Image source={item.image} alt={item.name} accessibilityLabel={item.name} contentFit="cover" style={{ width: 86, height: 108, borderRadius: radius.sm, backgroundColor: colors.skeleton }} />
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <AppText variant="caption" style={{ color: colors.textMuted }}>{item.brand}</AppText>
            <AppText variant="label">{item.name}</AppText>
            <AppText variant="caption">{[item.color, item.size].filter(Boolean).join(" · ")}</AppText>
            <AppText variant="label">{formatPrice(item.price * item.quantity, item.currency)}</AppText>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <QuantitySelector value={item.quantity} max={10} onChange={(quantity) => cart.updateQuantity(item.id, quantity)} />
              <Pressable onPress={() => cart.removeItem(item.id)}><AppText variant="caption" style={{ color: colors.danger }}>Remove</AppText></Pressable>
            </View>
          </View>
        </View>
      )}
      ListFooterComponent={cart.items.length ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {egp > 0 ? <AppText variant="title">Subtotal: {formatPrice(egp, "EGP")}</AppText> : null}
          {usd > 0 ? <AppText variant="title">Subtotal: {formatPrice(usd, "USD")}</AppText> : null}
          <AppText variant="caption" style={{ color: colors.textMuted }}>Prices, stock, discounts and the final total are revalidated before the order is created.</AppText>
          <AppButton label="Continue to checkout" onPress={() => router.push("/checkout" as Href)} />
        </View>
      ) : null}
    />
  );
}
