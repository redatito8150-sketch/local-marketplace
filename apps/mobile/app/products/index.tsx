import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { EmptyState } from "@/components/ui/Primitives";
import { ErrorState, LoadingState } from "@/components/system/States";
import { getProducts } from "@/domain/products";

export default function ProductsRoute() {
  const params = useLocalSearchParams<{ category?: string; title?: string }>();
  const query = useQuery({
    queryKey: ["products", "listing", params.category],
    queryFn: () => getProducts({ category: params.category, limit: 40 })
  });
  if (query.isLoading) return <LoadingState label="Loading products…" />;
  if (query.isError) return <ErrorState message="We couldn't load these products." onRetry={() => query.refetch()} />;
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: params.title ?? "Products" }} />
      <ProductGrid
        products={query.data ?? []}
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
        ListEmptyComponent={<EmptyState title="Nothing here yet" message="New pieces are added regularly." />}
      />
    </>
  );
}
