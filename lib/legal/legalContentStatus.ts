// The "live" entry point — wires the pure scanner in validateLegalContent.ts
// up against the actual /privacy and /terms content. Relative imports only,
// same reason as validateLegalContent.ts (this file is also imported by
// scripts/validate-legal-content.mjs, outside Next's "@/" alias resolution).
import { PRIVACY_SECTIONS, PRIVACY_INTRO } from "../../content/legal/privacy.ts";
import { TERMS_SECTIONS, TERMS_INTRO } from "../../content/legal/terms.ts";
import { LEGAL_EFFECTIVE_DATE, LEGAL_LAST_UPDATED_DATE } from "../../config/legal.ts";
import {
  findUnresolvedPlaceholders,
  assertNoUnresolvedPlaceholders,
  type LegalContentSource,
} from "./validateLegalContent.ts";

const LIVE_LEGAL_CONTENT: LegalContentSource[] = [
  { sections: PRIVACY_SECTIONS, strings: [PRIVACY_INTRO, LEGAL_EFFECTIVE_DATE, LEGAL_LAST_UPDATED_DATE] },
  { sections: TERMS_SECTIONS, strings: [TERMS_INTRO] },
];

export function findUnresolvedLegalContentPlaceholders(): string[] {
  return findUnresolvedPlaceholders(LIVE_LEGAL_CONTENT);
}

// Gate this at the call site (scripts/validate-legal-content.mjs) on
// VERCEL_ENV === "production" — this function itself always throws when
// something is unresolved, regardless of environment, so it stays simple
// and correct to unit test.
export function assertLegalContentIsProductionReady(): void {
  assertNoUnresolvedPlaceholders(LIVE_LEGAL_CONTENT);
}
