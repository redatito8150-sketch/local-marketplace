// Central place for every value the Privacy Policy and Terms & Conditions
// need but that hasn't been legally finalized yet. Update the values here
// — never inside content/legal/privacy.ts or content/legal/terms.ts — and
// every place that renders one of these placeholders updates automatically.
//
// Anything still wrapped in [SCREAMING_SNAKE_CASE] below is an unresolved
// legal placeholder: content/legal/*.ts reference these by key through
// LEGAL_PLACEHOLDERS, and components/legal/LegalPlaceholder.tsx renders any
// value that still looks like "[X]" with a visible "pending" treatment
// instead of silently printing it as if it were real, confirmed copy.
//
// TRADING_NAME is the one exception — "Mahaly" is the site's actual public
// brand name (used sitewide already), not a guess, so it's filled in for
// real. Every other value here is genuinely unconfirmed and must not be
// invented; see docs/legal-placeholders-todo.md for the full list an owner
// or lawyer needs to confirm before this page is legally final.

export const LEGAL_PLACEHOLDERS = {
  LEGAL_ENTITY_NAME: "[LEGAL_ENTITY_NAME]",
  TRADING_NAME: "Mahaly",
  COUNTRY_OF_OPERATION: "[COUNTRY_OF_OPERATION]",
  REGISTERED_ADDRESS: "[REGISTERED_ADDRESS]",
  PRIVACY_EMAIL: "[PRIVACY_EMAIL]",
  SUPPORT_EMAIL: "[SUPPORT_EMAIL]",
  DATA_RETENTION_PERIOD_OR_CRITERIA: "[DATA_RETENTION_PERIOD_OR_CRITERIA]",
  MINIMUM_AGE: "[MINIMUM_AGE]",
  APPLICABLE_PRIVACY_AUTHORITY: "[APPLICABLE_PRIVACY_AUTHORITY]",
  RETURN_WINDOW: "[RETURN_WINDOW]",
  CANCELLATION_RULES: "[CANCELLATION_RULES]",
  GOVERNING_LAW: "[GOVERNING_LAW]",
  COURT_OR_DISPUTE_FORUM: "[COURT_OR_DISPUTE_FORUM]",
} as const;

export type LegalPlaceholderKey = keyof typeof LEGAL_PLACEHOLDERS;

// A value still needs sign-off if it's wrapped in brackets — used by
// LegalPlaceholder to decide whether to render the "pending confirmation"
// treatment instead of plain text.
export function isUnresolvedPlaceholder(value: string): boolean {
  return /^\[[^[\]]+\]$/.test(value);
}

// Both pages share one effective/last-updated pair so they can't silently
// drift apart. Update when the legal content is actually revised — this is
// intentionally not "today" by default so a redeploy alone never bumps it.
export const LEGAL_EFFECTIVE_DATE = "[EFFECTIVE_DATE]";
export const LEGAL_LAST_UPDATED_DATE = "[LAST_UPDATED_DATE]";
