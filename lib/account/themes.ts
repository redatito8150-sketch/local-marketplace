import type { AccountTheme, NotificationPreferences } from "@/types";

export const DEFAULT_ACCOUNT_THEME: AccountTheme = "warm_sand";

export const ACCOUNT_THEMES: Array<{
  id: AccountTheme;
  name: string;
  description: string;
  colors: [string, string, string];
}> = [
  {
    id: "warm_sand",
    name: "Warm Sand",
    description: "Cream, soft beige, and a calm terracotta accent.",
    colors: ["#f7f0e5", "#fffaf2", "#a65346"],
  },
  {
    id: "soft_rose",
    name: "Soft Rose",
    description: "Warm white, dusty rose, and muted burgundy.",
    colors: ["#f9eeed", "#fff9f7", "#8d4650"],
  },
  {
    id: "olive_stone",
    name: "Olive Stone",
    description: "Warm stone, gentle olive, and deep green-gray.",
    colors: ["#efeee7", "#faf9f3", "#5d6652"],
  },
];

export function isAccountTheme(value: unknown): value is AccountTheme {
  return ACCOUNT_THEMES.some((theme) => theme.id === value);
}

export function accountThemeFromPreferences(
  preferences: NotificationPreferences | null | undefined,
): AccountTheme {
  return isAccountTheme(preferences?.accountTheme)
    ? preferences.accountTheme
    : DEFAULT_ACCOUNT_THEME;
}
