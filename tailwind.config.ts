import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Main-site tokens are CSS-var-backed (see app/globals.css's :root
        // and .dark blocks) so every existing bg-cream/text-ink/etc. class
        // repaints automatically when <html> gets the "dark" class — no
        // per-component dark: variants needed for these. The brand-page
        // template below (navy/accentred/charcoal/muted/hairline) is
        // deliberately NOT converted — that's a separate, static editorial
        // palette per CLAUDE.md and out of scope for this toggle.
        cream: "rgb(var(--color-cream) / <alpha-value>)",
        stone: {
          25: "rgb(var(--color-stone-25) / <alpha-value>)",
          50: "rgb(var(--color-stone-50) / <alpha-value>)",
          100: "rgb(var(--color-stone-100) / <alpha-value>)",
          150: "rgb(var(--color-stone-150) / <alpha-value>)",
        },
        beige: {
          50: "rgb(var(--color-beige-50) / <alpha-value>)",
          100: "rgb(var(--color-beige-100) / <alpha-value>)",
          200: "rgb(var(--color-beige-200) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--color-ink) / <alpha-value>)",
          soft: "rgb(var(--color-ink-soft) / <alpha-value>)",
        },
        // Mahaly brand red — the owner's official palette value (supersedes
        // an earlier logo-pixel-sampled guess). Main-site only (Header/
        // Footer/homepage). Deliberately a separate token from accentred
        // below — the brand-page palette is a different design brief and
        // must not be merged with this one.
        mahalyred: {
          DEFAULT: "rgb(var(--color-mahalyred) / <alpha-value>)", // --color-primary
          dark: "rgb(var(--color-mahalyred-dark) / <alpha-value>)", // --color-primary-hover
          soft: "rgb(var(--color-mahalyred-soft) / <alpha-value>)", // --color-primary-soft
        },
        // Owner-supplied Mahaly design-system colors not covered by the
        // existing cream/stone/beige/ink group above. Added alongside,
        // not replacing those — a full sitewide migration to these is a
        // separate, bigger visual decision, not done as part of this add.
        sand: "#E7D3AE", // --color-sand
        blue: {
          light: "#DCE6EC", // --color-blue-light
          grey: "#AABBC5", // --color-blue-grey
        },
        card: "rgb(var(--color-card) / <alpha-value>)", // --color-card
        border: "rgb(var(--color-border) / <alpha-value>)", // --color-border
        textmuted: "rgb(var(--color-textmuted) / <alpha-value>)", // --color-text-muted
        // Dedicated palette for the LOCAL brand-page template (navy/red editorial)
        // — static by design, never dark-mode-aware (see comment above).
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
