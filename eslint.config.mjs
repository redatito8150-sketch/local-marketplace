import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  { ignores: [".claude/**"] },
  ...nextCoreWebVitals,
];

export default eslintConfig;
