import { Href, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { ProductCard } from "@/components/catalog/ProductCard";
import { AppText } from "@/components/ui/AppText";
import { SectionHeader } from "@/components/ui/Primitives";
import { Product } from "@/domain/products";
import { useAppTheme } from "@/theme/ThemeProvider";

type HorizontalProductSectionProps = {
  title: string;
  products: Product[];
};

export function HorizontalProductSection({ title, products }: HorizontalProductSectionProps) {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();

  if (!products.length) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader
        title={title}
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Explore all ${title}`}
            onPress={() => router.push(`/products?title=${encodeURIComponent(title)}` as Href)}
          >
            <AppText variant="caption" style={{ color: colors.primary }}>
              Explore
            </AppText>
          </Pressable>
        }
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md }}
      >
        {products.map((product) => (
          <View key={product.id} style={{ width: 176 }}>
            <ProductCard product={product} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
