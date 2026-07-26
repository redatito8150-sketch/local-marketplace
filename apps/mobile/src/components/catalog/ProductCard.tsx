import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Href, useRouter } from "expo-router";
import { AppText } from "@/components/ui/AppText";
import { Product, formatPrice } from "@/domain/products";
import { useAppTheme } from "@/theme/ThemeProvider";

export function ProductCard({ product }: { product: Product }) {
  const router = useRouter();
  const { colors, radius, spacing } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name} by ${product.brand_name}, ${formatPrice(product.price, product.currency)}`}
      onPress={() => router.push(`/products/${encodeURIComponent(product.id)}` as Href)}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.surfaceRaised, borderRadius: radius.md, opacity: pressed ? 0.82 : 1 }]}
    >
      <Image source={product.image} alt={product.name} accessibilityLabel={product.name} contentFit="cover" transition={180} style={[styles.image, { backgroundColor: colors.skeleton, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md }]} />
      <View style={{ padding: spacing.sm, gap: spacing.xxs }}>
        <AppText variant="caption" style={{ color: colors.textMuted }}>{product.brand_name}</AppText>
        <AppText variant="label" numberOfLines={2}>{product.name}</AppText>
        <AppText variant="label">{formatPrice(product.price, product.currency)}</AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, overflow: "hidden", minWidth: 0 },
  image: { width: "100%", aspectRatio: 0.78 }
});
