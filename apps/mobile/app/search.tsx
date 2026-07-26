import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Href, Stack, useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { ProductGridSkeleton } from "@/components/catalog/ProductGridSkeleton";
import { ErrorState } from "@/components/system/States";
import { EmptyState, FilterChip } from "@/components/ui/Primitives";
import { AppText } from "@/components/ui/AppText";
import { TextField } from "@/components/ui/TextField";
import { getCatalogFacets, getProducts } from "@/domain/products";
import { useAppTheme } from "@/theme/ThemeProvider";

export default function SearchRoute() {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const [value, setValue] = useState("");
  const [queryText, setQueryText] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const pageSize = 20;
  useEffect(() => {
    AsyncStorage.getItem("mahaly:recent-searches").then((stored) => {
      if (stored) setRecent(JSON.parse(stored) as string[]);
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setQueryText(value.trim()), 300);
    return () => clearTimeout(timer);
  }, [value]);
  const query = useInfiniteQuery({
    queryKey: ["products", "search", queryText],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getProducts({ query: queryText, limit: pageSize, page: pageParam }),
    getNextPageParam: (lastPage, pages) => lastPage.length === pageSize ? pages.length : undefined,
    enabled: queryText.length >= 2,
  });
  const facets = useQuery({ queryKey: ["products", "facets"], queryFn: getCatalogFacets, staleTime: 5 * 60_000 });
  const products = queryText.length >= 2 ? query.data?.pages.flat() ?? [] : [];
  const brands = [...new Map(products.filter((product) => product.brand_slug).map((product) => [product.brand_slug!, product.brand_name])).entries()];
  const categories = [...new Set(products.map((product) => product.category).filter((value): value is string => Boolean(value)))];
  useEffect(() => {
    if (queryText.length < 2 || !query.isSuccess || !products.length) return;
    AsyncStorage.getItem("mahaly:recent-searches").then((stored) => {
      const current = stored ? JSON.parse(stored) as string[] : [];
      const next = [queryText, ...current.filter((item) => item.toLowerCase() !== queryText.toLowerCase())].slice(0, 6);
      return AsyncStorage.setItem("mahaly:recent-searches", JSON.stringify(next)).then(() => setRecent(next));
    }).catch(() => undefined);
  }, [query.isSuccess, queryText, products.length]);
  const clearRecent = () => {
    setRecent([]);
    AsyncStorage.removeItem("mahaly:recent-searches").catch(() => undefined);
  };
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Search" }} />
      <ProductGrid
        products={products}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => !query.isFetchingNextPage && query.fetchNextPage()}
        onEndReachedThreshold={0.6}
        ListHeaderComponent={<View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
          <TextField autoFocus kind="search" value={value} onChangeText={setValue} placeholder="Search products, brands and categories" />
          {!queryText && recent.length ? <View style={{ gap: spacing.xs }}><View style={{ flexDirection: "row", justifyContent: "space-between" }}><AppText variant="label">Recent searches</AppText><AppText accessibilityRole="button" variant="caption" style={{ color: colors.primary }} onPress={clearRecent}>Clear</AppText></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>{recent.map((item) => <FilterChip key={item} label={item} onPress={() => setValue(item)} />)}</ScrollView></View> : null}
          {!queryText && facets.data?.categories.length ? <View style={{ gap: spacing.xs }}><AppText variant="label">Browse categories</AppText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>{facets.data.categories.map((category) => <FilterChip key={category} label={category.replace(/\b\w/g, (letter) => letter.toUpperCase())} onPress={() => setValue(category)} />)}</ScrollView></View> : null}
          {brands.length ? <View style={{ gap: spacing.xs }}><AppText variant="label">Brands</AppText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>{brands.map(([slug, name]) => <FilterChip key={slug} label={name} onPress={() => router.push(`/brands/${encodeURIComponent(slug)}` as Href)} />)}</ScrollView></View> : null}
          {categories.length ? <View style={{ gap: spacing.xs }}><AppText variant="label">Categories</AppText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>{categories.map((category) => <FilterChip key={category} label={category} onPress={() => router.push(`/products?category=${encodeURIComponent(category)}&title=${encodeURIComponent(category)}` as Href)} />)}</ScrollView></View> : null}
          {products.length ? <AppText variant="caption" style={{ color: colors.textMuted }}>{products.length} product results</AppText> : null}
        </View>}
        ListEmptyComponent={
          query.isLoading ? <ProductGridSkeleton count={4} /> :
          query.isError ? <ErrorState message="Search is unavailable." onRetry={() => query.refetch()} /> :
          <EmptyState title={queryText ? "No matches" : "Find your next piece"} message={queryText ? "Try a different name or brand." : "Search Mahaly's live catalog."} />
        }
      />
    </>
  );
}
