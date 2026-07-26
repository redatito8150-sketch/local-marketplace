import { Href, useRouter } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { useAppTheme } from "@/theme/ThemeProvider";

const categories = [
  { slug: "women", label: "Women", icon: "woman-outline" },
  { slug: "men", label: "Men", icon: "man-outline" },
  { slug: "kids", label: "Kids", icon: "happy-outline" },
  { slug: "home", label: "Home", icon: "home-outline" }
] as const;

export default function CategoriesRoute() {
  const router = useRouter();
  const { colors, radius, spacing } = useAppTheme();
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
            onPress={() => router.push(`/products?category=${item.slug}&title=${encodeURIComponent(item.label)}` as Href)}
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
