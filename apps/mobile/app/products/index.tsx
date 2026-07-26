import { useInfiniteQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { ProductGridSkeleton } from "@/components/catalog/ProductGridSkeleton";
import { EmptyState } from "@/components/ui/Primitives";
import { ErrorState, LoadingState } from "@/components/system/States";
import { getProducts } from "@/domain/products";

export default function ProductsRoute() {
  const params = useLocalSearchParams<{ category?: string; title?: string }>();
  const pageSize = 20;
  const query = useInfiniteQuery({
    queryKey: ["products", "listing", params.category],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getProducts({ category: params.category, limit: pageSize, page: pageParam }),
    getNextPageParam: (lastPage, pages) => lastPage.length === pageSize ? pages.length : undefined
  });
  if (query.isLoading) return <ProductGridSkeleton />;
  if (query.isError) return <ErrorState message="We couldn't load these products." onRetry={() => query.refetch()} />;
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: params.title ?? "Products" }} />
      <ProductGrid
        products={query.data?.pages.flat() ?? []}
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
        onEndReached={() => !query.isFetchingNextPage && query.fetchNextPage()}
        onEndReachedThreshold={0.6}
        ListFooterComponent={query.isFetchingNextPage ? <LoadingState label="Loading more…" /> : null}
        ListEmptyComponent={<EmptyState title="Nothing here yet" message="New pieces are added regularly." />}
      />
    </>
  );
}
