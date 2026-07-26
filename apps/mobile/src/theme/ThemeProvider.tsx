import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, ColorSchemeName, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkColors, lightColors, radius, spacing, typography } from "./tokens";

export type ThemePreference = "system" | "light" | "dark";

type ThemeContextValue = {
  isDark: boolean;
  preference: ThemePreference;
  colors: typeof lightColors;
  radius: typeof radius;
  spacing: typeof spacing;
  typography: typeof typography;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_KEY = "mahaly_theme_preference_v1";

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>("system");
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((value) => {
      if (value === "system" || value === "light" || value === "dark") setPreference(value);
    });
  }, []);
  const updatePreference = useCallback((value: ThemePreference) => {
    setPreference(value);
    void AsyncStorage.setItem(THEME_KEY, value);
  }, []);
  const resolvedScheme: ColorSchemeName =
    preference === "system" ? systemScheme ?? Appearance.getColorScheme() : preference;
  const isDark = resolvedScheme === "dark";

  const value = useMemo(
    () => ({
      isDark,
      preference,
      colors: isDark ? darkColors : lightColors,
      radius,
      spacing,
      typography,
      setPreference: updatePreference
    }),
    [isDark, preference, updatePreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used inside ThemeProvider");
  }
  return context;
}
