import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { useState } from "react";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Badge, BottomActionBar, FilterChip } from "@/components/ui/Primitives";
import { ErrorState, LoadingState } from "@/components/system/States";
import { formatPrice, getProduct } from "@/domain/products";
import { useAppTheme } from "@/theme/ThemeProvider";
import { useCart } from "@/providers/CartProvider";
import { toggleWishlist } from "@/domain/wishlist";
import { useAuth } from "@/providers/AuthProvider";
import { getReviews } from "@/domain/brands";
import { ReviewCard } from "@/components/reviews/ReviewCard";

export default function ProductDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const auth = useAuth();
  const { colors, spacing } = useAppTheme();
  const cart = useCart();
  const queryClient = useQueryClient();
  const wishlist = useMutation({ mutationFn: toggleWishlist, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wishlist"] }) });
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const query = useQuery({ queryKey: ["product", id], queryFn: () => getProduct(id), enabled: Boolean(id), refetchInterval: 60_000 });
  const reviews = useQuery({ queryKey: ["reviews", "product", id], queryFn: () => getReviews({ productId: id }), enabled: Boolean(id) });
  if (query.isLoading) return <LoadingState label="Loading product…" />;
  if (query.isError) return <ErrorState message="We couldn't load this product." onRetry={() => query.refetch()} />;
  const product = query.data;
  if (!product) return <ErrorState title="Product unavailable" message="This piece is no longer published." />;
  const selectedVariant = product.variants?.find((variant) =>
    (variant.size ?? "").trim().toLowerCase() === size.trim().toLowerCase() &&
    (variant.color ?? "").trim().toLowerCase() === color.trim().toLowerCase()
  );
  const hasVariants = Boolean(product.variants?.length);
  const selectedUnavailable = Boolean(
    (hasVariants && (!selectedVariant || selectedVariant.availability_status !== "available")) ||
    (product.track_inventory && selectedVariant && selectedVariant.quantity < 1) ||
    product.unavailable_sizes.includes(size)
  );
  const activePrice = selectedVariant?.price_override ?? product.price;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: true, title: product.brand_name }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Image source={product.images[0] || product.image} alt={product.name} contentFit="cover" style={{ width: "100%", aspectRatio: 0.78, backgroundColor: colors.skeleton }} accessibilityLabel={product.name} />
        <View style={{ padding: spacing.md, gap: spacing.sm }}>
          <AppText variant="caption" style={{ color: colors.textMuted }} onPress={() => product.brand_slug && router.push(`/brands/${product.brand_slug}` as never)}>{product.brand_name}</AppText>
          <AppText variant="title">{product.name}</AppText>
          <AppText variant="title">{formatPrice(activePrice, product.currency)}</AppText>
          {!product.in_stock ? <Badge tone="warning">Out of stock</Badge> : null}
          {product.colors.length ? <><AppText variant="label">Color</AppText><View style={{ flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" }}>{product.colors.map((item) => <FilterChip key={item.name} label={item.name} selected={color === item.name} onPress={() => setColor(item.name)} />)}</View></> : null}
          {product.sizes.length ? <><AppText variant="label">Size</AppText><View style={{ flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" }}>{product.sizes.map((item) => <FilterChip key={item} label={item} selected={size === item} onPress={() => setSize(item)} />)}</View></> : null}
          <AppText>{product.description}</AppText>
          <AppButton label={wishlist.isPending ? "Saving…" : "Save to wishlist"} variant="secondary" loading={wishlist.isPending} onPress={() => auth.isAuthenticated ? wishlist.mutate(product.id) : router.push("/sign-in")} />
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}><AppText variant="title">Reviews {reviews.data?.summary.total ? `· ${reviews.data.summary.average.toFixed(1)}` : ""}</AppText>{reviews.data?.eligibleItems.length ? <AppButton label="Write a verified review" variant="secondary" onPress={() => router.push(`/reviews/write?productId=${encodeURIComponent(product.id)}` as never)} /> : null}{reviews.data?.reviews.slice(0, 3).map((review) => <ReviewCard key={review.id} review={review} />)}</View>
        </View>
      </ScrollView>
      <BottomActionBar><AppButton
        label={product.in_stock ? "Add to cart" : "Out of stock"}
        disabled={!product.in_stock || selectedUnavailable || (product.sizes.length > 0 && !size) || (product.colors.length > 0 && !color)}
        onPress={() => cart.addItem({ productId: product.id, name: product.name, brand: product.brand_name, image: product.image, price: activePrice, currency: product.currency, size: size || "One size", color: color || undefined, quantity: 1 })}
      /></BottomActionBar>
    </View>
  );
}
