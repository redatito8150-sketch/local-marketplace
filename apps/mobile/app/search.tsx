import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { ProductGridSkeleton } from "@/components/catalog/ProductGridSkeleton";
import { ErrorState } from "@/components/system/States";
import { EmptyState } from "@/components/ui/Primitives";
import { TextField } from "@/components/ui/TextField";
import { getProducts } from "@/domain/products";
import { useAppTheme } from "@/theme/ThemeProvider";

export default function SearchRoute() {
  const { spacing } = useAppTheme();
  const [value, setValue] = useState("");
  const [queryText, setQueryText] = useState("");
  const pageSize = 20;
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
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Search" }} />
      <ProductGrid
        products={queryText.length >= 2 ? query.data?.pages.flat() ?? [] : []}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => !query.isFetchingNextPage && query.fetchNextPage()}
        onEndReachedThreshold={0.6}
        ListHeaderComponent={<TextField autoFocus kind="search" value={value} onChangeText={setValue} placeholder="Search products and brands" style={{ marginBottom: spacing.sm }} />}
        ListEmptyComponent={
          query.isLoading ? <ProductGridSkeleton count={4} /> :
          query.isError ? <ErrorState message="Search is unavailable." onRetry={() => query.refetch()} /> :
          <EmptyState title={queryText ? "No matches" : "Find your next piece"} message={queryText ? "Try a different name or brand." : "Search Mahaly's live catalog."} />
        }
      />
    </>
  );
}
