export const palette = {
  burgundy: "#8C2638",
  burgundyPressed: "#711D2C",
  ivory: "#F7F1E8",
  paper: "#FFFDFC",
  ink: "#1A1715",
  mutedInk: "#706963",
  line: "#E4DCD2",
  gold: "#B98A50",
  success: "#307552",
  warning: "#9A651D",
  danger: "#B3263B",
  white: "#FFFFFF",
  black: "#0E0E0F"
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999
} as const;

export const typography = {
  family: {
    display: "Georgia",
    body: "System"
  },
  size: {
    caption: 12,
    body: 15,
    label: 14,
    title: 22,
    display: 34
  },
  lineHeight: {
    caption: 16,
    body: 22,
    title: 28,
    display: 40
  }
} as const;

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  overlay: string;
  skeleton: string;
};

export const lightColors: ThemeColors = {
  background: palette.ivory,
  surface: palette.paper,
  surfaceRaised: palette.white,
  text: palette.ink,
  textMuted: palette.mutedInk,
  border: palette.line,
  primary: palette.burgundy,
  primaryPressed: palette.burgundyPressed,
  onPrimary: palette.white,
  accent: palette.gold,
  success: palette.success,
  warning: palette.warning,
  danger: palette.danger,
  overlay: "rgba(14, 14, 15, 0.45)",
  skeleton: "#E9E1D8"
};

export const darkColors: ThemeColors = {
  background: "#11100F",
  surface: "#1A1817",
  surfaceRaised: "#24211F",
  text: "#F8F2EA",
  textMuted: "#B9B0A8",
  border: "#37322E",
  primary: "#9E3046",
  primaryPressed: "#B43C53",
  onPrimary: palette.white,
  accent: "#D2A568",
  success: "#69AC86",
  warning: "#D9A75A",
  danger: "#EE7386",
  overlay: "rgba(0, 0, 0, 0.64)",
  skeleton: "#2B2825"
};
