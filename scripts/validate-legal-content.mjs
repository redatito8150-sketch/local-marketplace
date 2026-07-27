// scripts/validate-legal-content.mjs
//
// Build-time gate: refuses a real Vercel Production deployment if /privacy
// or /terms still contain unresolved [BRACKET_TOKEN] legal placeholders
// (unconfirmed entity name, address, governing law, etc. — see
// docs/legal-placeholders-todo.md). Wired into `npm run build` (see
// package.json), which is exactly what Vercel invokes.
//
// Only gates VERCEL_ENV === "production" — the one reliable "this build is
// really going live" signal. NODE_ENV isn't safe to gate on here: Next.js
// sets it to "production" for every `next build`, including local builds
// and Vercel Preview deployments, which would otherwise block routine
// local/preview builds before legal copy is finalized.
import { assertLegalContentIsProductionReady, findUnresolvedLegalContentPlaceholders } from "../lib/legal/legalContentStatus.ts";

if (process.env.VERCEL_ENV === "production") {
  try {
    assertLegalContentIsProductionReady();
    console.log("[legal] All legal placeholders resolved — production build may proceed.");
  } catch (error) {
    console.error(`\n[legal] BUILD BLOCKED — ${error.message}\n`);
    process.exit(1);
  }
} else {
  const unresolved = findUnresolvedLegalContentPlaceholders();
  if (unresolved.length > 0) {
    console.warn(
      `[legal] ${unresolved.length} unresolved legal placeholder(s) present — OK outside Production ` +
        `(VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}): ${unresolved.join(", ")}`
    );
  }
}
