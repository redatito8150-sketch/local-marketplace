import { Image } from "expo-image";
import { Href, useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useAppTheme } from "@/theme/ThemeProvider";

type MoodCardProps = {
  category: string;
  image: string;
  title: string;
};

export function MoodCard({ category, image, title }: MoodCardProps) {
  const router = useRouter();
  const { colors, radius, spacing } = useAppTheme();
  const categoryLabel = category.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Shop ${title}`}
      onPress={() => router.push(`/products?audience=${encodeURIComponent(category)}&title=${encodeURIComponent(title)}` as Href)}
      style={({ pressed }) => ({
        width: 238,
        height: 156,
        overflow: "hidden",
        borderRadius: radius.lg,
        backgroundColor: colors.skeleton,
        opacity: pressed ? 0.84 : 1,
      })}
    >
      <Image
        source={image}
        alt={title}
        accessibilityLabel={title}
        contentFit="cover"
        transition={180}
        style={{ position: "absolute", inset: 0 }}
      />
      <View
        style={{
          position: "absolute",
          inset: 0,
          justifyContent: "flex-end",
          padding: spacing.md,
          backgroundColor: "rgba(20, 12, 10, 0.28)",
        }}
      >
        <AppText variant="title" style={{ color: colors.onPrimary }}>
          {title}
        </AppText>
        <AppText variant="caption" style={{ color: colors.onPrimary }}>
          Shop {categoryLabel}
        </AppText>
      </View>
    </Pressable>
  );
}
