import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#FAFAF8",
        stone: {
          25: "#FAFAF9",
          50: "#F6F5F3",
          100: "#EFEDE9",
          150: "#E7E4DE",
        },
        beige: {
          50: "#F5F1EA",
          100: "#EDE6D9",
          200: "#E1D6C2",
        },
        ink: {
          DEFAULT: "#161513",
          soft: "#2B2A27",
        },
        // Mahaly brand red — sampled from the real logo file, main-site only
        // (Header/Footer/homepage). Deliberately a separate token from
        // accentred below — the brand-page palette is a different design
        // brief and must not be merged with this one.
        mahalyred: {
          DEFAULT: "#D10506",
          dark: "#AF0405",
        },
        // Dedicated palette for the LOCAL brand-page template (navy/red editorial)
        navy: {
          DEFAULT: "#103B5C",
          dark: "#0C2E47",
        },
        accentred: "#D7262E",
        charcoal: "#111111",
        muted: "#6B6B6B",
        hairline: "#E8E8E8",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "Segoe UI",
          "sans-serif",
        ],
        serif: [
          "Playfair Display",
          "Cormorant Garamond",
          "Georgia",
          "serif",
        ],
      },
      borderRadius: {
        xl2: "20px",
        xl3: "24px",
      },
      boxShadow: {
        soft: "0 4px 24px rgba(22, 21, 19, 0.06)",
        card: "0 12px 40px rgba(22, 21, 19, 0.10)",
        cardHover: "0 24px 60px rgba(22, 21, 19, 0.16)",
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      maxWidth: {
        screen2xl: "1440px",
        screen3xl: "1560px",
        brand: "1320px",
      },
    },
  },
  plugins: [],
};

export default config;
