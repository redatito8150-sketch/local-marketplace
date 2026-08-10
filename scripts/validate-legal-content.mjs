// scripts/validate-legal-content.mjs
//
// Reports unresolved [BRACKET_TOKEN] legal placeholders in /privacy or
// /terms (unconfirmed entity name, address, governing law, etc. — see
// docs/legal-placeholders-todo.md) at build time. Wired into `npm run
// build` (see package.json), which is exactly what Vercel invokes.
//
// Local and Preview builds warn so development can continue. Production is
// fail-closed: a published privacy policy or terms page must never contain
// unresolved legal tokens. LEGAL_CONTENT_STRICT=true can opt any other build
// into the same gate (for example a pre-production CI job). A deliberately
// named development-only override exists for temporarily publishing a site
// that is still under active development; strict mode always wins over it.
import { assertLegalContentIsProductionReady, findUnresolvedLegalContentPlaceholders } from "../lib/legal/legalContentStatus.ts";

const unresolved = findUnresolvedLegalContentPlaceholders();
const productionBuild =
  process.env.VERCEL_ENV === "production" ||
  (process.env.CI === "true" && process.env.NODE_ENV === "production");
const strictRequested = process.env.LEGAL_CONTENT_STRICT === "true";
const developmentOverride = process.env.LEGAL_CONTENT_ALLOW_UNRESOLVED === "true";
const strict = strictRequested || (productionBuild && !developmentOverride);

if (unresolved.length === 0) {
  console.log("[legal] All legal placeholders resolved.");
} else if (!strict) {
  const overrideNotice = developmentOverride && productionBuild
    ? " EXPLICIT DEVELOPMENT OVERRIDE ACTIVE; do not treat this deployment as legally launch-ready."
    : "";
  console.warn(
    `\n[legal] ${unresolved.length} unresolved legal placeholder(s) in /privacy or /terms: ` +
      `${unresolved.join(", ")}\n[legal] Not blocking this build — site is still under development.` +
      `${overrideNotice}\n`
  );
} else {
  try {
    assertLegalContentIsProductionReady();
  } catch (error) {
    console.error(`\n[legal] BUILD BLOCKED: ${error.message}\n`);
    process.exit(1);
  }
}
