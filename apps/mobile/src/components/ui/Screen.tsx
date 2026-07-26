import { PropsWithChildren } from "react";
import { ScrollView, ScrollViewProps, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "@/theme/ThemeProvider";

type Props = PropsWithChildren<
  ScrollViewProps & { scroll?: boolean; padded?: boolean }
>;

export function Screen({ children, scroll = false, padded = true, style, ...props }: Props) {
  const { colors, spacing } = useAppTheme();
  const contentStyle = [
    styles.content,
    padded && { paddingHorizontal: spacing.md },
    style
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {scroll ? (
        <ScrollView {...props} contentContainerStyle={contentStyle}>
          {children}
        </ScrollView>
      ) : (
        <View {...props} style={contentStyle}>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { flexGrow: 1 }
});
