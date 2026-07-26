import { Text, TextProps, TextStyle } from "react-native";
import { useAppTheme } from "@/theme/ThemeProvider";

export type TextVariant = "display" | "title" | "body" | "label" | "caption";

export function AppText({
  variant = "body",
  style,
  ...props
}: TextProps & { variant?: TextVariant }) {
  const { colors, typography } = useAppTheme();
  const display = variant === "display" || variant === "title";
  const variantStyle: TextStyle =
    variant === "display"
      ? { fontSize: typography.size.display, lineHeight: typography.lineHeight.display }
      : variant === "title"
        ? { fontSize: typography.size.title, lineHeight: typography.lineHeight.title }
        : variant === "caption"
          ? { fontSize: typography.size.caption, lineHeight: typography.lineHeight.caption }
          : { fontSize: typography.size.body, lineHeight: typography.lineHeight.body };

  return (
    <Text
      {...props}
      style={[
        {
          color: colors.text,
          fontFamily: display ? typography.family.display : typography.family.body,
          fontWeight: variant === "label" ? "600" : "400"
        },
        variantStyle,
        style
      ]}
    />
  );
}
