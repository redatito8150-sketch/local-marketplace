import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { ErrorState, LoadingState } from "@/components/system/States";
import { EmptyState } from "@/components/ui/Primitives";
import { TextField } from "@/components/ui/TextField";
import { getProducts } from "@/domain/products";
import { useAppTheme } from "@/theme/ThemeProvider";

export default function SearchRoute() {
  const { spacing } = useAppTheme();
  const [value, setValue] = useState("");
  const queryText = useDeferredValue(value.trim());
  const query = useQuery({
    queryKey: ["products", "search", queryText],
    queryFn: () => getProducts({ query: queryText, limit: 40 }),
    enabled: queryText.length >= 2
  });
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Search" }} />
      <ProductGrid
        products={query.data ?? []}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<TextField autoFocus kind="search" value={value} onChangeText={setValue} placeholder="Search products and brands" style={{ marginBottom: spacing.sm }} />}
        ListEmptyComponent={
          query.isLoading ? <LoadingState /> :
          query.isError ? <ErrorState message="Search is unavailable." onRetry={() => query.refetch()} /> :
          <EmptyState title={queryText ? "No matches" : "Find your next piece"} message={queryText ? "Try a different name or brand." : "Search Mahaly's live catalog."} />
        }
      />
    </>
  );
}
