import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Href, useRouter } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { ErrorState, LoadingState } from "@/components/system/States";
import { AppText } from "@/components/ui/AppText";
import { EmptyState } from "@/components/ui/Primitives";
import { formatPrice } from "@/domain/products";
import { getWishlist, removeWishlist } from "@/domain/wishlist";
import { useAppTheme } from "@/theme/ThemeProvider";

export default function WishlistRoute() {
  const router = useRouter(); const client = useQueryClient(); const { colors, radius, spacing } = useAppTheme();
  const query = useQuery({ queryKey: ["wishlist"], queryFn: getWishlist });
  const remove = useMutation({
    mutationFn: removeWishlist,
    onMutate: async (productId) => {
      await client.cancelQueries({ queryKey: ["wishlist"] });
      const previous = client.getQueryData(["wishlist"]);
      client.setQueryData(["wishlist"], (items: Awaited<ReturnType<typeof getWishlist>> = []) => items.filter((item) => item.productId !== productId));
      return { previous };
    },
    onError: (_error, _id, context) => client.setQueryData(["wishlist"], context?.previous),
    onSettled: () => client.invalidateQueries({ queryKey: ["wishlist"] })
  });
  return <AuthGuard>{query.isLoading ? <LoadingState /> : query.isError ? <ErrorState message="We couldn't load your wishlist." onRetry={() => query.refetch()} /> :
    <FlatList style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, flexGrow: 1 }} data={query.data ?? []} keyExtractor={(item) => item.productId}
      ListHeaderComponent={<AppText variant="display" style={{ marginVertical: spacing.md }}>Wishlist</AppText>}
      ListEmptyComponent={<EmptyState title="Your wishlist is empty" message="Save pieces you want to revisit." />}
      renderItem={({ item }) => <Pressable onPress={() => router.push(`/products/${item.productId}` as Href)} style={{ flexDirection: "row", gap: spacing.sm, backgroundColor: colors.surfaceRaised, padding: spacing.sm, borderRadius: radius.md }}>
        <Image source={item.image} alt={item.name} accessibilityLabel={item.name} style={{ width: 90, height: 116, borderRadius: radius.sm, backgroundColor: colors.skeleton }} contentFit="cover" />
        <View style={{ flex: 1, gap: spacing.xs }}><AppText variant="caption" style={{ color: colors.textMuted }}>{item.brand}</AppText><AppText variant="label">{item.name}</AppText><AppText>{formatPrice(item.price, item.currency)}</AppText><Pressable onPress={() => remove.mutate(item.productId)}><AppText variant="caption" style={{ color: colors.danger }}>Remove</AppText></Pressable></View>
      </Pressable>} />}
  </AuthGuard>;
}
