import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Href, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppText } from "@/components/ui/AppText";
import { Product, formatPrice } from "@/domain/products";
import { useAppTheme } from "@/theme/ThemeProvider";
import { getWishlist, toggleWishlist, WishlistItem } from "@/domain/wishlist";
import { useAuth } from "@/providers/AuthProvider";

export function ProductCard({ product }: { product: Product }) {
  const router = useRouter();
  const auth = useAuth();
  const client = useQueryClient();
  const { colors, radius, spacing } = useAppTheme();
  const wishlist = useQuery({ queryKey: ["wishlist"], queryFn: getWishlist, enabled: auth.isAuthenticated, staleTime: 60_000 });
  const wishlisted = wishlist.data?.some((item) => item.productId === product.id) ?? false;
  const toggle = useMutation({
    mutationFn: () => toggleWishlist(product.id),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: ["wishlist"] });
      const previous = client.getQueryData<WishlistItem[]>(["wishlist"]) ?? [];
      const nextItem: WishlistItem = { productId: product.id, name: product.name, brand: product.brand_name, price: product.price, currency: product.currency, image: product.image };
      client.setQueryData<WishlistItem[]>(["wishlist"], previous.some((item) => item.productId === product.id) ? previous.filter((item) => item.productId !== product.id) : [...previous, nextItem]);
      return { previous };
    },
    onError: (_error, _variables, context) => client.setQueryData(["wishlist"], context?.previous),
    onSettled: () => client.invalidateQueries({ queryKey: ["wishlist"] }),
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name} by ${product.brand_name}, ${formatPrice(product.price, product.currency)}`}
      onPress={() => router.push(`/products/${encodeURIComponent(product.id)}` as Href)}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.surfaceRaised, borderRadius: radius.md, opacity: pressed ? 0.82 : 1 }]}
    >
      <Image source={product.image} alt={product.name} accessibilityLabel={product.name} contentFit="cover" transition={180} style={[styles.image, { backgroundColor: colors.skeleton, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md }]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={wishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
        accessibilityState={{ selected: wishlisted, busy: toggle.isPending }}
        disabled={toggle.isPending}
        onPress={(event) => {
          event.stopPropagation();
          if (!auth.isAuthenticated) router.push("/sign-in");
          else toggle.mutate();
        }}
        style={{ position: "absolute", top: spacing.xs, right: spacing.xs, width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised }}
      >
        <Ionicons name={wishlisted ? "heart" : "heart-outline"} size={21} color={wishlisted ? colors.primary : colors.text} />
      </Pressable>
      <View style={{ padding: spacing.sm, gap: spacing.xxs }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xs }}><AppText variant="caption" style={{ color: colors.textMuted, flex: 1 }} numberOfLines={1}>{product.brand_name}</AppText>{product.colors.length ? <View style={{ flexDirection: "row" }}>{product.colors.slice(0, 3).map((color, index) => <View key={`${color.name}-${index}`} accessibilityLabel={color.name} style={{ width: 10, height: 10, borderRadius: 99, marginLeft: index ? -2 : 0, borderWidth: 1, borderColor: colors.surfaceRaised, backgroundColor: color.hex || colors.border }} />)}</View> : null}</View>
        <AppText variant="label" numberOfLines={2}>{product.name}</AppText>
        <View style={{ flexDirection: "row", gap: spacing.xs, alignItems: "center", flexWrap: "wrap" }}><AppText variant="label">{formatPrice(product.price, product.currency)}</AppText>{product.compare_at_price && product.compare_at_price > product.price ? <AppText variant="caption" style={{ color: colors.textMuted, textDecorationLine: "line-through" }}>{formatPrice(product.compare_at_price, product.currency)}</AppText> : null}</View>
        {product.review_count ? <AppText variant="caption" style={{ color: colors.textMuted }}>★ {product.rating.toFixed(1)} ({product.review_count})</AppText> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, overflow: "hidden", minWidth: 0 },
  image: { width: "100%", aspectRatio: 0.78 }
});
