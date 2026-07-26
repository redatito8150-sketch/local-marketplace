import { View } from "react-native";
import { useAppTheme } from "@/theme/ThemeProvider";

export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  const { colors, radius, spacing } = useAppTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading products"
      style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, padding: spacing.md }}
    >
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={{
            width: `48%`,
            gap: spacing.xs,
            paddingBottom: spacing.sm,
            borderRadius: radius.md,
            overflow: "hidden",
            backgroundColor: colors.surfaceRaised,
          }}
        >
          <View style={{ width: "100%", aspectRatio: 0.78, backgroundColor: colors.skeleton }} />
          <View style={{ width: "45%", height: 10, marginHorizontal: spacing.sm, backgroundColor: colors.skeleton, borderRadius: radius.pill }} />
          <View style={{ width: "75%", height: 14, marginHorizontal: spacing.sm, backgroundColor: colors.skeleton, borderRadius: radius.pill }} />
          <View style={{ width: "55%", height: 14, marginHorizontal: spacing.sm, backgroundColor: colors.skeleton, borderRadius: radius.pill }} />
        </View>
      ))}
    </View>
  );
}
