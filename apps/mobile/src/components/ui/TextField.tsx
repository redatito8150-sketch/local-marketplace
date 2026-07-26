import { forwardRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  TextInputProps,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "./AppText";
import { useAppTheme } from "@/theme/ThemeProvider";

type Props = TextInputProps & {
  label?: string;
  error?: string;
  kind?: "text" | "password" | "search";
};

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, error, kind = "text", style, ...props },
  ref
) {
  const { colors, radius, spacing } = useAppTheme();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = kind === "password";

  return (
    <View style={{ gap: spacing.xs }}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <View
        style={[
          styles.field,
          {
            borderColor: error ? colors.danger : colors.border,
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            paddingHorizontal: spacing.sm
          }
        ]}
      >
        {kind === "search" ? (
          <Ionicons name="search" size={19} color={colors.textMuted} />
        ) : null}
        <TextInput
          ref={ref}
          {...props}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={isPassword && !passwordVisible}
          style={[styles.input, { color: colors.text }, style]}
        />
        {isPassword ? (
          <Pressable
            accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
            hitSlop={10}
            onPress={() => setPasswordVisible((value) => !value)}
          >
            <Ionicons
              name={passwordVisible ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText variant="caption" style={{ color: colors.danger }}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: {
    minHeight: 50,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 12 }
});
