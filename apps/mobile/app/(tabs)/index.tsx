import { useQuery } from "@tanstack/react-query";
import { Href, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { ErrorState, LoadingState } from "@/components/system/States";
import { AppText } from "@/components/ui/AppText";
import { TextField } from "@/components/ui/TextField";
import { FilterChip, SectionHeader } from "@/components/ui/Primitives";
import { getProducts } from "@/domain/products";
import { useAppTheme } from "@/theme/ThemeProvider";

export default function HomeRoute() {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const query = useQuery({ queryKey: ["products", "home"], queryFn: () => getProducts({ limit: 20 }) });
  if (query.isLoading) return <LoadingState label="Curating Mahaly…" />;
  if (query.isError) return <ErrorState message="We couldn't load Mahaly right now." onRetry={() => query.refetch()} />;
  const products = query.data ?? [];
  const categories = [...new Set(products.map((product) => product.category).filter((value): value is string => Boolean(value)))];
  const brands = [...new Map(products.filter((product) => product.brand_slug).map((product) => [product.brand_slug!, product.brand_name])).entries()];
  return (
    <ProductGrid
      products={products}
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
      ListHeaderComponent={
        <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
          <AppText variant="display">Mahaly</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Open search" onPress={() => router.push("/search")}>
            <View pointerEvents="none"><TextField kind="search" placeholder="Search products and brands" editable={false} /></View>
          </Pressable>
          <View style={{ backgroundColor: colors.primary, padding: spacing.lg, borderRadius: 22, gap: spacing.xs }}>
            <AppText variant="title" style={{ color: colors.onPrimary }}>Original pieces, locally made.</AppText>
            <AppText style={{ color: colors.onPrimary }}>Discover independent Egyptian brands selected for quality and character.</AppText>
          </View>
          {categories.length ? <View style={{ gap: spacing.sm }}><SectionHeader title="Shop by category" action={<Pressable accessibilityRole="button" onPress={() => router.push("/categories")}><AppText variant="caption" style={{ color: colors.primary }}>View all</AppText></Pressable>} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>{categories.map((category) => <FilterChip key={category} label={category.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())} onPress={() => router.push(`/products?category=${encodeURIComponent(category)}&title=${encodeURIComponent(category)}` as Href)} />)}</ScrollView></View> : null}
          {brands.length ? <View style={{ gap: spacing.sm }}><SectionHeader title="Featured brands" /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>{brands.map(([slug, name]) => <FilterChip key={slug} label={name} onPress={() => router.push(`/brands/${encodeURIComponent(slug)}` as Href)} />)}</ScrollView></View> : null}
          <AppText variant="title">New and noteworthy</AppText>
        </View>
      }
    />
  );
}
