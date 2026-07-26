import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { useState } from "react";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Badge, BottomActionBar, Divider, FilterChip, QuantitySelector } from "@/components/ui/Primitives";
import { ErrorState, LoadingState } from "@/components/system/States";
import { findProductVariant, formatPrice, getProduct, getProducts, resolveProductPrice } from "@/domain/products";
import { useAppTheme } from "@/theme/ThemeProvider";
import { useCart } from "@/providers/CartProvider";
import { toggleWishlist } from "@/domain/wishlist";
import { useAuth } from "@/providers/AuthProvider";
import { getReviews } from "@/domain/brands";
import { ReviewCard } from "@/components/reviews/ReviewCard";
import { ImageCarousel } from "@/components/catalog/ImageCarousel";
import { ProductCard } from "@/components/catalog/ProductCard";

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
  const [quantity, setQuantity] = useState(1);
  const query = useQuery({ queryKey: ["product", id], queryFn: () => getProduct(id), enabled: Boolean(id), refetchInterval: 60_000 });
  const reviews = useQuery({ queryKey: ["reviews", "product", id], queryFn: () => getReviews({ productId: id }), enabled: Boolean(id) });
  const related = useQuery({ queryKey: ["products", "related", query.data?.category, id], queryFn: () => getProducts({ category: query.data?.category ?? undefined, limit: 8 }), enabled: Boolean(query.data?.category) });
  if (query.isLoading) return <LoadingState label="Loading product…" />;
  if (query.isError) return <ErrorState message="We couldn't load this product." onRetry={() => query.refetch()} />;
  const product = query.data;
  if (!product) return <ErrorState title="Product unavailable" message="This piece is no longer published." />;
  const selectedVariant = findProductVariant(product.variants, size, color);
  const hasVariants = Boolean(product.variants?.length);
  const selectedUnavailable = Boolean(
    (hasVariants && (!selectedVariant || selectedVariant.availability_status !== "available")) ||
    (product.track_inventory && selectedVariant && selectedVariant.quantity < 1) ||
    product.unavailable_sizes.includes(size)
  );
  const activePrice = resolveProductPrice(product, selectedVariant);
  const discount = product.compare_at_price && product.compare_at_price > activePrice ? Math.round((1 - activePrice / product.compare_at_price) * 100) : 0;
  const availableQuantity = product.track_inventory && selectedVariant ? Math.max(selectedVariant.quantity, 1) : 10;
  const addToCart = () => cart.addItem({ productId: product.id, name: product.name, brand: product.brand_name, image: product.image, price: activePrice, currency: product.currency, size: size || "One size", color: color || undefined, quantity });
  const purchaseDisabled = !product.in_stock || selectedUnavailable || (product.sizes.length > 0 && !size) || (product.colors.length > 0 && !color);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: true, title: product.brand_name }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <ImageCarousel images={[...new Set([...(product.images ?? []), product.image])]} label={product.name} />
        <View style={{ padding: spacing.md, gap: spacing.sm }}>
          <AppText accessibilityRole="link" variant="caption" style={{ color: colors.primary }} onPress={() => product.brand_slug && router.push(`/brands/${product.brand_slug}` as never)}>{product.brand_name}</AppText>
          <AppText variant="title">{product.name}</AppText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" }}><AppText variant="title">{formatPrice(activePrice, product.currency)}</AppText>{discount ? <><AppText style={{ color: colors.textMuted, textDecorationLine: "line-through" }}>{formatPrice(product.compare_at_price!, product.currency)}</AppText><Badge tone="warning">-{discount}%</Badge></> : null}</View>
          {product.review_count ? <AppText variant="caption" style={{ color: colors.textMuted }}>★ {product.rating.toFixed(1)} · {product.review_count} reviews</AppText> : null}
          {!product.in_stock ? <Badge tone="warning">Out of stock</Badge> : null}
          {product.colors.length ? <><AppText variant="label">Color</AppText><View style={{ flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" }}>{product.colors.map((item) => <FilterChip key={item.name} label={item.name} selected={color === item.name} onPress={() => setColor(item.name)} />)}</View></> : null}
          {product.sizes.length ? <><AppText variant="label">Size</AppText><View style={{ flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" }}>{product.sizes.map((item) => <FilterChip key={item} label={item} selected={size === item} onPress={() => setSize(item)} />)}</View></> : null}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><AppText variant="label">Quantity</AppText><QuantitySelector value={quantity} onChange={setQuantity} max={availableQuantity} /></View>
          <Divider />
          <AppText>{product.description}</AppText>
          {product.details.length ? <View style={{ gap: spacing.xs }}><AppText variant="label">Details & materials</AppText>{product.details.map((detail) => <AppText key={detail} style={{ color: colors.textMuted }}>• {detail}</AppText>)}</View> : null}
          {product.care_instructions.length ? <View style={{ gap: spacing.xs }}><AppText variant="label">Care</AppText>{product.care_instructions.map((instruction) => <AppText key={instruction} style={{ color: colors.textMuted }}>• {instruction}</AppText>)}</View> : null}
          {product.shipping_returns ? <View style={{ gap: spacing.xs }}><AppText variant="label">Shipping & returns</AppText><AppText style={{ color: colors.textMuted }}>{product.shipping_returns}</AppText></View> : null}
          <AppButton label={wishlist.isPending ? "Saving…" : "Save to wishlist"} variant="secondary" loading={wishlist.isPending} onPress={() => auth.isAuthenticated ? wishlist.mutate(product.id) : router.push("/sign-in")} />
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}><AppText variant="title">Reviews {reviews.data?.summary.total ? `· ${reviews.data.summary.average.toFixed(1)}` : ""}</AppText>{reviews.data?.eligibleItems.length ? <AppButton label="Write a verified review" variant="secondary" onPress={() => router.push(`/reviews/write?productId=${encodeURIComponent(product.id)}` as never)} /> : null}{reviews.data?.reviews.slice(0, 3).map((review) => <ReviewCard key={review.id} review={review} />)}</View>
          {(related.data ?? []).filter((item) => item.id !== product.id).length ? <View style={{ marginTop: spacing.lg, gap: spacing.sm }}><AppText variant="title">You may also like</AppText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>{(related.data ?? []).filter((item) => item.id !== product.id).slice(0, 6).map((item) => <View key={item.id} style={{ width: 170 }}><ProductCard product={item} /></View>)}</ScrollView></View> : null}
        </View>
      </ScrollView>
      <BottomActionBar><View style={{ flexDirection: "row", gap: spacing.sm }}><AppButton
        label={product.in_stock ? "Add to cart" : "Out of stock"}
        disabled={purchaseDisabled}
        onPress={addToCart}
        style={{ flex: 1 }}
      /><AppButton label="Buy now" disabled={purchaseDisabled} onPress={() => { addToCart(); router.push("/checkout"); }} style={{ flex: 1 }} /></View></BottomActionBar>
    </View>
  );
}
