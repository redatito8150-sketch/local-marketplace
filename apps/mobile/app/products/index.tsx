import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { ProductGridSkeleton } from "@/components/catalog/ProductGridSkeleton";
import { AppSheet, EmptyState, FilterChip } from "@/components/ui/Primitives";
import { ErrorState, LoadingState } from "@/components/system/States";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { formatPrice, getCatalogFacets, getProductPage, ProductSort } from "@/domain/products";
import { useAppTheme } from "@/theme/ThemeProvider";

export default function ProductsRoute() {
  const params = useLocalSearchParams<{ category?: string; title?: string }>();
  const { colors, spacing } = useAppTheme();
  const [sort, setSort] = useState<ProductSort>("newest");
  const [brand, setBrand] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [inStock, setInStock] = useState(false);
  const [discounted, setDiscounted] = useState(false);
  const [minimumRating, setMinimumRating] = useState(0);
  const [priceBand, setPriceBand] = useState<"all" | "low" | "high">("all");
  const [sheet, setSheet] = useState<"sort" | "filter" | null>(null);
  const pageSize = 20;
  const facets = useQuery({ queryKey: ["products", "facets"], queryFn: getCatalogFacets, staleTime: 5 * 60_000 });
  const query = useInfiniteQuery({
    queryKey: ["products", "listing", params.category, sort, brand, productCategory, color, size, inStock, discounted, minimumRating, priceBand],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getProductPage({
      category: params.category,
      sort,
      brand: brand || undefined,
      productCategory: productCategory || undefined,
      color: color || undefined,
      size: size || undefined,
      inStock,
      discounted,
      minimumRating: minimumRating || undefined,
      maxPrice: priceBand === "low" && facets.data ? Math.round((facets.data.price.min + facets.data.price.max) / 2) : undefined,
      minPrice: priceBand === "high" && facets.data ? Math.round((facets.data.price.min + facets.data.price.max) / 2) : undefined,
      limit: pageSize,
      page: pageParam,
    }),
    getNextPageParam: (lastPage, pages) => pages.reduce((total, page) => total + page.products.length, 0) < lastPage.total ? pages.length : undefined
  });
  if (query.isLoading) return <ProductGridSkeleton />;
  if (query.isError) return <ErrorState message="We couldn't load these products." onRetry={() => query.refetch()} />;
  const products = query.data?.pages.flatMap((page) => page.products) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const activeCount = [brand, productCategory, color, size, inStock, discounted, minimumRating, priceBand !== "all"].filter(Boolean).length;
  const resetFilters = () => { setBrand(""); setProductCategory(""); setColor(""); setSize(""); setInStock(false); setDiscounted(false); setMinimumRating(0); setPriceBand("all"); };
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: params.title ?? "Products" }} />
      <ProductGrid
        products={products}
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
        onEndReached={() => !query.isFetchingNextPage && query.fetchNextPage()}
        onEndReachedThreshold={0.6}
        ListFooterComponent={query.isFetchingNextPage ? <LoadingState label="Loading more…" /> : null}
        ListHeaderComponent={<View style={{ gap: spacing.sm, paddingBottom: spacing.xs }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
            <View><AppText variant="title">{params.title ?? "All products"}</AppText><AppText variant="caption" style={{ color: colors.textMuted }}>{total} pieces</AppText></View>
            {activeCount ? <Pressable accessibilityRole="button" onPress={resetFilters}><AppText variant="caption" style={{ color: colors.primary }}>Clear filters</AppText></Pressable> : null}
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <AppButton label="Sort" variant="secondary" onPress={() => setSheet("sort")} style={{ flex: 1 }} />
            <AppButton label={`Filter${activeCount ? ` (${activeCount})` : ""}`} variant="secondary" onPress={() => setSheet("filter")} style={{ flex: 1 }} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
            {brand ? <FilterChip label={brand} selected onPress={() => setBrand("")} /> : null}
            {productCategory ? <FilterChip label={productCategory} selected onPress={() => setProductCategory("")} /> : null}
            {color ? <FilterChip label={color} selected onPress={() => setColor("")} /> : null}
            {size ? <FilterChip label={`Size ${size}`} selected onPress={() => setSize("")} /> : null}
            {inStock ? <FilterChip label="In stock" selected onPress={() => setInStock(false)} /> : null}
            {discounted ? <FilterChip label="On sale" selected onPress={() => setDiscounted(false)} /> : null}
            {minimumRating ? <FilterChip label={`${minimumRating}+ stars`} selected onPress={() => setMinimumRating(0)} /> : null}
            {priceBand !== "all" ? <FilterChip label={priceBand === "low" ? "Lower price" : "Higher price"} selected onPress={() => setPriceBand("all")} /> : null}
          </ScrollView>
        </View>}
        ListEmptyComponent={<EmptyState title="Nothing here yet" message="New pieces are added regularly." />}
      />
      <AppSheet visible={sheet === "sort"} title="Sort products" onClose={() => setSheet(null)}>
        {([
          ["newest", "Newest"],
          ["price-asc", "Price: low to high"],
          ["price-desc", "Price: high to low"],
          ["top-rated", "Highest rated"],
        ] as [ProductSort, string][]).map(([value, label]) =>
          <FilterChip key={value} label={label} selected={sort === value} onPress={() => { setSort(value); setSheet(null); }} />
        )}
      </AppSheet>
      <AppSheet visible={sheet === "filter"} title="Filter products" onClose={() => setSheet(null)}>
        <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: spacing.md }}>
          <View style={{ gap: spacing.xs }}><AppText variant="label">Availability</AppText><View style={{ flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" }}><FilterChip label="In stock" selected={inStock} onPress={() => setInStock((value) => !value)} /><FilterChip label="On sale" selected={discounted} onPress={() => setDiscounted((value) => !value)} /><FilterChip label="4+ stars" selected={minimumRating === 4} onPress={() => setMinimumRating((value) => value === 4 ? 0 : 4)} /></View></View>
          <View style={{ gap: spacing.xs }}><AppText variant="label">Brand</AppText><View style={{ flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" }}>{facets.data?.brands.slice(0, 20).map((item) => <FilterChip key={item} label={item} selected={brand === item} onPress={() => setBrand(brand === item ? "" : item)} />)}</View></View>
          <View style={{ gap: spacing.xs }}><AppText variant="label">Product type</AppText><View style={{ flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" }}>{facets.data?.productCategories.map((item) => <FilterChip key={item} label={item} selected={productCategory === item} onPress={() => setProductCategory(productCategory === item ? "" : item)} />)}</View></View>
          {facets.data && Number.isFinite(facets.data.price.min) ? <View style={{ gap: spacing.xs }}><AppText variant="label">Price</AppText><View style={{ flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" }}><FilterChip label="All prices" selected={priceBand === "all"} onPress={() => setPriceBand("all")} /><FilterChip label={`Up to ${formatPrice(Math.round((facets.data.price.min + facets.data.price.max) / 2), "EGP")}`} selected={priceBand === "low"} onPress={() => setPriceBand("low")} /><FilterChip label={`${formatPrice(Math.round((facets.data.price.min + facets.data.price.max) / 2), "EGP")}+`} selected={priceBand === "high"} onPress={() => setPriceBand("high")} /></View></View> : null}
          <View style={{ gap: spacing.xs }}><AppText variant="label">Color</AppText><View style={{ flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" }}>{facets.data?.colors.map((item) => <FilterChip key={item} label={item} selected={color === item} onPress={() => setColor(color === item ? "" : item)} />)}</View></View>
          <View style={{ gap: spacing.xs }}><AppText variant="label">Size</AppText><View style={{ flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" }}>{facets.data?.sizes.map((item) => <FilterChip key={item} label={item} selected={size === item} onPress={() => setSize(size === item ? "" : item)} />)}</View></View>
          <AppButton label="Show results" onPress={() => setSheet(null)} />
        </ScrollView>
      </AppSheet>
    </>
  );
}
