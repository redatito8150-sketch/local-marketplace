import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Href, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { ErrorState, LoadingState } from "@/components/system/States";
import { AppText } from "@/components/ui/AppText";
import { FilterChip, SectionHeader } from "@/components/ui/Primitives";
import { getProducts } from "@/domain/products";
import { useAppTheme } from "@/theme/ThemeProvider";

export default function HomeRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, radius, spacing } = useAppTheme();
  const query = useQuery({ queryKey: ["products", "home"], queryFn: () => getProducts({ limit: 20 }) });
  if (query.isLoading) return <LoadingState label="Curating Mahaly…" />;
  if (query.isError) return <ErrorState message="We couldn't load Mahaly right now." onRetry={() => query.refetch()} />;
  const products = query.data ?? [];
  const categories = [...new Set(products.map((product) => product.category).filter((value): value is string => Boolean(value)))];
  return (
    <ProductGrid
      products={products}
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: 116 }}
      ListHeaderComponent={
        <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
          <View
            style={{
              height: 270,
              overflow: "hidden",
              borderRadius: 28,
              backgroundColor: colors.skeleton
            }}
          >
            <Image
              source={require("../../assets/images/home-shopping-hero.jpg")}
              alt="Shoppers discovering local fashion in a refined boutique"
              accessibilityLabel="Discover local fashion"
              contentFit="cover"
              transition={250}
              style={{ position: "absolute", inset: 0 }}
            />
            <View
              style={{
                position: "absolute",
                inset: 0,
                justifyContent: "flex-end",
                padding: spacing.lg,
                backgroundColor: "rgba(18, 10, 9, 0.26)"
              }}
            >
              <View style={{ gap: spacing.sm, maxWidth: "78%" }}>
                <AppText variant="caption" style={{ color: colors.onPrimary, fontWeight: "700", letterSpacing: 1.3 }}>
                  CURATED IN EGYPT
                </AppText>
                <AppText variant="title" style={{ color: colors.onPrimary }}>
                  Find something made to feel like you.
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Shop all products"
                  onPress={() => router.push("/products?title=All%20Products" as Href)}
                  style={({ pressed }) => ({
                    alignSelf: "flex-start",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.xs,
                    paddingHorizontal: spacing.md,
                    paddingVertical: 10,
                    borderRadius: radius.pill,
                    backgroundColor: colors.surfaceRaised,
                    opacity: pressed ? 0.82 : 1
                  })}
                >
                  <AppText variant="label">Shop All</AppText>
                  <AppText variant="label">→</AppText>
                </Pressable>
              </View>
            </View>
          </View>
          {categories.length ? <View style={{ gap: spacing.sm }}><SectionHeader title="Shop by category" action={<Pressable accessibilityRole="button" onPress={() => router.push("/categories")}><AppText variant="caption" style={{ color: colors.primary }}>View all</AppText></Pressable>} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>{categories.map((category) => <FilterChip key={category} label={category.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())} onPress={() => router.push(`/products?category=${encodeURIComponent(category)}&title=${encodeURIComponent(category)}` as Href)} />)}</ScrollView></View> : null}
          <AppText variant="title">New and noteworthy</AppText>
        </View>
      }
    />
  );
}
