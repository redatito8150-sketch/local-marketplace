import { ActivityIndicator, Pressable, PressableProps, StyleSheet } from "react-native";
import { AppText } from "./AppText";
import { useAppTheme } from "@/theme/ThemeProvider";

type Props = PressableProps & {
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
};

export function AppButton({
  label,
  variant = "primary",
  loading = false,
  disabled,
  style,
  ...props
}: Props) {
  const { colors, radius, spacing } = useAppTheme();
  const filled = variant === "primary" || variant === "danger";
  const backgroundColor =
    variant === "primary" ? colors.primary : variant === "danger" ? colors.danger : "transparent";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      {...props}
      style={(state) => [
        styles.base,
        {
          backgroundColor,
          borderColor: variant === "secondary" ? colors.border : "transparent",
          borderRadius: radius.md,
          paddingHorizontal: spacing.lg,
          opacity: disabled ? 0.5 : state.pressed ? 0.78 : 1
        },
        typeof style === "function" ? style(state) : style
      ]}
    >
      {loading ? (
        <ActivityIndicator color={filled ? colors.onPrimary : colors.primary} />
      ) : (
        <AppText
          variant="label"
          style={{ color: filled ? colors.onPrimary : colors.primary }}
        >
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  }
});
