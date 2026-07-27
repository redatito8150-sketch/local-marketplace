// scripts/validate-legal-content.mjs
//
// Reports unresolved [BRACKET_TOKEN] legal placeholders in /privacy or
// /terms (unconfirmed entity name, address, governing law, etc. — see
// docs/legal-placeholders-todo.md) at build time. Wired into `npm run
// build` (see package.json), which is exactly what Vercel invokes.
//
// NON-BLOCKING BY DEFAULT — the site is still under development, so an
// unresolved placeholder must never fail local, Preview, or Production
// builds right now. It only prints a clear, itemized warning.
//
// FUTURE STRICT MODE (enable before the official public launch): set
// LEGAL_CONTENT_STRICT=true in the environment doing the build (e.g. as a
// Vercel Production-only environment variable) to make this script exit
// non-zero — and therefore fail `npm run build` — whenever an unresolved
// placeholder remains. Nothing else needs to change; the check itself
// (lib/legal/legalContentStatus.ts) already exists and is already covered
// by tests/legalContentValidation.test.ts. Turn this on only once every
// field in docs/legal-placeholders-todo.md is filled in for real, or
// deliberately as a pre-launch safety net.
import { assertLegalContentIsProductionReady, findUnresolvedLegalContentPlaceholders } from "../lib/legal/legalContentStatus.ts";

const unresolved = findUnresolvedLegalContentPlaceholders();
const strict = process.env.LEGAL_CONTENT_STRICT === "true";

if (unresolved.length === 0) {
  console.log("[legal] All legal placeholders resolved.");
} else if (!strict) {
  console.warn(
    `\n[legal] ${unresolved.length} unresolved legal placeholder(s) in /privacy or /terms: ` +
      `${unresolved.join(", ")}\n[legal] Not blocking this build — site is still under development. ` +
      "Set LEGAL_CONTENT_STRICT=true to enforce this before launch.\n"
  );
} else {
  try {
    assertLegalContentIsProductionReady();
  } catch (error) {
    console.error(`\n[legal] LEGAL_CONTENT_STRICT=true — BUILD BLOCKED: ${error.message}\n`);
    process.exit(1);
  }
}
