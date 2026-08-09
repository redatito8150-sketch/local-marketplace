import { Href, useRouter } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ErrorState, LoadingState } from "@/components/system/States";
import { getCatalogFacets } from "@/domain/products";
import { useAppTheme } from "@/theme/ThemeProvider";

const categoryIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  women: "woman-outline",
  men: "man-outline",
  kids: "happy-outline",
  home: "home-outline",
  shoes: "footsteps-outline",
  bags: "bag-handle-outline",
  accessories: "diamond-outline",
  beauty: "sparkles-outline",
};

export default function CategoriesRoute() {
  const router = useRouter();
  const { colors, radius, spacing } = useAppTheme();
  const query = useQuery({ queryKey: ["products", "facets"], queryFn: getCatalogFacets, staleTime: 5 * 60_000 });
  if (query.isLoading) return <LoadingState label="Loading categories…" />;
  if (query.isError) return <ErrorState message="We couldn't load categories." onRetry={() => query.refetch()} />;
  const categories = (query.data?.audiences ?? []).map((slug) => ({
    slug,
    label: slug.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    icon: categoryIcons[slug.toLowerCase()] ?? "grid-outline",
  }));
  return (
    <Screen>
      <AppText variant="display" style={{ marginVertical: spacing.lg }}>Categories</AppText>
      <FlatList
        data={categories}
        keyExtractor={(item) => item.slug}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.sm }}
        contentContainerStyle={{ gap: spacing.sm }}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.label} category`}
            onPress={() => router.push(`/products?audience=${item.slug}&title=${encodeURIComponent(item.label)}` as Href)}
            style={{ flex: 1, minHeight: 150, backgroundColor: colors.surfaceRaised, borderRadius: radius.lg, padding: spacing.md, justifyContent: "space-between" }}
          >
            <Ionicons name={item.icon} size={30} color={colors.primary} />
            <View><AppText variant="title">{item.label}</AppText><AppText variant="caption" style={{ color: colors.textMuted }}>Explore collection</AppText></View>
          </Pressable>
        )}
      />
    </Screen>
  );
}
