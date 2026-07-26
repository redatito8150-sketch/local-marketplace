import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Href, useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HorizontalProductSection } from "@/components/home/HorizontalProductSection";
import { MoodCard } from "@/components/home/MoodCard";
import { ErrorState, LoadingState } from "@/components/system/States";
import { AppText } from "@/components/ui/AppText";
import { SectionHeader } from "@/components/ui/Primitives";
import { getProducts } from "@/domain/products";
import { useAppTheme } from "@/theme/ThemeProvider";

const moodTitles: Record<string, string> = {
  women: "Effortless elegance",
  men: "Modern essentials",
  kids: "Little adventures",
  home: "Quiet living",
};

export default function HomeRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, radius, spacing } = useAppTheme();
  const query = useQuery({ queryKey: ["products", "home"], queryFn: () => getProducts({ limit: 20 }) });

  if (query.isLoading) return <LoadingState label="Curating Mahaly…" />;
  if (query.isError) return <ErrorState message="We couldn't load Mahaly right now." onRetry={() => query.refetch()} />;

  const products = query.data ?? [];
  const newArrivals = products.slice(0, 10);
  const exploreProducts = products.length > 10
    ? products.slice(10, 20)
    : [...products].sort((left, right) => right.rating - left.rating || right.review_count - left.review_count);
  const moods = [...new Map(
    products
      .filter((product) => product.category && product.image)
      .map((product) => [product.category!, product])
  ).entries()].slice(0, 4);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 116 }}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => query.refetch()}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <View style={{ height: 314, overflow: "hidden", backgroundColor: colors.skeleton }}>
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
            paddingHorizontal: spacing.md,
            paddingBottom: spacing.lg,
            backgroundColor: "rgba(18, 10, 9, 0.26)",
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
                opacity: pressed ? 0.82 : 1,
              })}
            >
              <AppText variant="label">Shop All</AppText>
              <AppText variant="label">→</AppText>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={{ gap: spacing.xl, paddingHorizontal: spacing.md, paddingTop: spacing.lg }}>
        <HorizontalProductSection title="New Arrivals" products={newArrivals} />

        {moods.length ? (
          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="Shop by Mood" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md }}
            >
              {moods.map(([category, product]) => (
                <MoodCard
                  key={category}
                  category={category}
                  image={product.image}
                  title={moodTitles[category.toLowerCase()] ?? `The ${category} edit`}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <HorizontalProductSection title="Explore" products={exploreProducts} />
      </View>
    </ScrollView>
  );
}
