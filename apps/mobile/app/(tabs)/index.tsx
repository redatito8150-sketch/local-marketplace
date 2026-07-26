import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { ErrorState, LoadingState } from "@/components/system/States";
import { AppText } from "@/components/ui/AppText";
import { TextField } from "@/components/ui/TextField";
import { getProducts } from "@/domain/products";
import { useAppTheme } from "@/theme/ThemeProvider";

export default function HomeRoute() {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const query = useQuery({ queryKey: ["products", "home"], queryFn: () => getProducts({ limit: 20 }) });
  if (query.isLoading) return <LoadingState label="Curating Mahaly…" />;
  if (query.isError) return <ErrorState message="We couldn't load Mahaly right now." onRetry={() => query.refetch()} />;
  return (
    <ProductGrid
      products={query.data ?? []}
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
      ListHeaderComponent={
        <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
          <AppText variant="display">Mahaly</AppText>
          <Pressable onPress={() => router.push("/search")}>
            <View pointerEvents="none"><TextField kind="search" placeholder="Search products and brands" editable={false} /></View>
          </Pressable>
          <View style={{ backgroundColor: colors.primary, padding: spacing.lg, borderRadius: 22, gap: spacing.xs }}>
            <AppText variant="title" style={{ color: colors.onPrimary }}>Original pieces, locally made.</AppText>
            <AppText style={{ color: colors.onPrimary }}>Discover independent Egyptian brands selected for quality and character.</AppText>
          </View>
          <AppText variant="title">New and noteworthy</AppText>
        </View>
      }
    />
  );
}
