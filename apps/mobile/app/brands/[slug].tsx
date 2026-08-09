import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Href, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { ProductCard } from "@/components/catalog/ProductCard";
import { ReviewCard } from "@/components/reviews/ReviewCard";
import { ErrorState, LoadingState } from "@/components/system/States";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Card, EmptyState, FilterChip } from "@/components/ui/Primitives";
import { brandProductToProduct, getBrand, isBrandProductDiscounted, toggleBrandFollow } from "@/domain/brands";
import type { Brand, Review } from "@/domain/brands";
import type { Product } from "@/domain/products";
import { useAuth } from "@/providers/AuthProvider";
import { useAppTheme } from "@/theme/ThemeProvider";

type Tab = "Products" | "Collections" | "Offers" | "About" | "Reviews";
type BrandListItem = Product | Review | Brand["shopTheLook"][number] | Brand["values"][number];
const tabs: Tab[] = ["Products", "Collections", "Offers", "About", "Reviews"];
export default function BrandRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>(); const router = useRouter(); const client = useQueryClient(); const auth = useAuth(); const { colors, radius, spacing } = useAppTheme(); const [tab, setTab] = useState<Tab>("Products");
  const query = useQuery({ queryKey: ["brand", slug], queryFn: () => getBrand(slug), enabled: Boolean(slug) });
  const follow = useMutation({ mutationFn: () => toggleBrandFollow(slug), onSuccess: () => client.invalidateQueries({ queryKey: ["brand", slug] }) });
  if (query.isLoading) return <LoadingState label="Loading brand…" />;
  if (query.isError || !query.data) return <ErrorState message="This brand is unavailable." onRetry={() => query.refetch()} />;
  const { brand, reviews, isFollowing } = query.data;
  const productData = brand.products.map(brandProductToProduct);
  const offers = brand.products.filter((item) => isBrandProductDiscounted(item)).map(brandProductToProduct);
  const data: BrandListItem[] = tab === "Products" ? productData : tab === "Offers" ? offers : tab === "Reviews" ? reviews.reviews : tab === "Collections" ? brand.shopTheLook : brand.values;
  return <><Stack.Screen options={{ headerShown: true, title: brand.name }} /><FlatList
    style={{ backgroundColor: colors.background }} data={data} key={tab} numColumns={tab === "Products" || tab === "Offers" ? 2 : 1}
    keyExtractor={(item, index) => "id" in item ? item.id : item.title || String(index)}
    columnWrapperStyle={tab === "Products" || tab === "Offers" ? { gap: spacing.sm } : undefined}
    contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
    ListHeaderComponent={<View style={{ gap: spacing.md }}><Image source={brand.heroImage} alt={brand.name} contentFit="cover" style={{ width: "100%", aspectRatio: 1.7, borderRadius: radius.lg, backgroundColor: colors.skeleton }} /><AppText variant="display">{brand.name}</AppText><AppText style={{ color: colors.textMuted }}>{brand.tagline} · {brand.city}</AppText><View style={{ flexDirection: "row", gap: spacing.lg }}><AppText variant="label">{brand.followerCount} followers</AppText>{brand.storeRating ? <AppText variant="label">{brand.storeRating.toFixed(1)} rating</AppText> : null}</View><AppButton label={isFollowing ? "Following" : "Follow"} variant={isFollowing ? "secondary" : "primary"} loading={follow.isPending} onPress={() => auth.isAuthenticated ? follow.mutate() : router.push("/sign-in")} /><View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>{tabs.map((item) => <FilterChip key={item} label={item} selected={tab === item} onPress={() => setTab(item)} />)}</View>{tab === "Reviews" ? <View><AppText variant="title">{reviews.summary.average.toFixed(1)} · {reviews.summary.total} reviews</AppText><AppButton label="Write a review" variant="secondary" onPress={() => router.push(`/reviews/write?brandSlug=${encodeURIComponent(slug)}` as Href)} /></View> : null}</View>}
    ListEmptyComponent={<EmptyState title={`No ${tab.toLowerCase()} yet`} message="This brand has not published anything in this section." />}
    renderItem={({ item }) => {
      if (tab === "Products" || tab === "Offers") return <ProductCard product={item as Product} />;
      if (tab === "Reviews") return <ReviewCard review={item as Review} />;
      if (tab === "Collections") {
        const look = item as Brand["shopTheLook"][number];
        const productId = look.href.split("/").filter(Boolean).at(-1);
        return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${look.title}`} onPress={() => productId && router.push(`/products/${encodeURIComponent(productId)}` as Href)}><Card><Image source={look.image} alt={look.title} style={{ width: "100%", aspectRatio: 1.5, borderRadius: radius.md }} /><AppText variant="title">{look.title}</AppText></Card></Pressable>;
      }
      const value = item as Brand["values"][number];
      return <Card><AppText variant="title">{value.title}</AppText><AppText>{value.description}</AppText></Card>;
    }}
    ListFooterComponent={tab === "About" ? <View style={{ gap: spacing.md }}><AppText variant="title">Our story</AppText><AppText>{brand.aboutDescription}</AppText><AppText>{brand.storyBody}</AppText></View> : null}
  /></>;
}
