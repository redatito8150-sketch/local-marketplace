import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: [
      ".claude/**",
      "apps/mobile/.expo/**",
      "apps/mobile/dist*/**",
    ],
  },
  ...nextCoreWebVitals,
];

export default eslintConfig;
