import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: [
      ".claude/**",
      ".codex/**",
      // React Native is linted by its own toolchain. The web app uses
      // eslint-config-next, whose React DOM rules produce false positives
      // for React Native Animated values.
      "apps/mobile/**",
      "apps/mobile/.expo/**",
      "apps/mobile/dist*/**",
    ],
  },
  ...nextCoreWebVitals,
];

export default eslintConfig;
