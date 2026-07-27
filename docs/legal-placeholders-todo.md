# Legal placeholders — outstanding owner/lawyer confirmations

`/privacy` and `/terms` are fully built and content-complete, but they
intentionally still contain unresolved `[BRACKET_TOKEN]` placeholders for
anything that hasn't been legally finalized — see
`config/legal.ts` for the registry and
`components/legal/LegalPlaceholder.tsx` for how they're rendered (a
visibly marked "pending confirmation" badge, never plain bracket text).

None of these were invented — each is a real legal/business decision that
needs the site owner or counsel to confirm before this policy is
publish-ready. Update the value in `config/legal.ts` (or, for the two
one-off items at the bottom, directly in `content/legal/privacy.ts` /
`content/legal/terms.ts`) and the fix applies everywhere that token is used
— no other file needs to change.

## Production deployment gate

`npm run build` (exactly what Vercel runs) now runs
`scripts/validate-legal-content.mjs` first. That script scans the actual
rendered `/privacy` and `/terms` content
(`lib/legal/legalContentStatus.ts` → `lib/legal/validateLegalContent.ts`)
for every `[BRACKET_TOKEN]` placeholder still present, **not** just the
ones registered in `config/legal.ts` — so a stray placeholder added later
directly in `content/legal/*.ts` is caught too.

- **Gated only on a real Vercel Production build** (`VERCEL_ENV ===
  "production"`) — the one signal that reliably means "this is actually
  going live." Local builds and Vercel Preview deployments are
  unaffected (they only print a warning listing what's still unresolved),
  so the team can keep using `next build`/Preview URLs to review the
  design before legal sign-off.
- **When it fires**, the build fails immediately with a non-zero exit and
  a message listing every unresolved token by name — nothing partial gets
  deployed.
- **Every field currently in this document blocks that gate** — all 12
  tokens in the table below, `EFFECTIVE_DATE`/`LAST_UPDATED_DATE`, and the
  two one-off review-flag tokens. As of this writing that's 16 unresolved
  tokens; a real Production deploy will fail until all 16 reach zero.
- Covered by `tests/legalContentValidation.test.ts` — both the pure
  scanner (synthetic fixtures) and an assertion that the real, current
  content is correctly detected as not-yet-production-ready.

## Registered in config/legal.ts

| Token | Used in | What's needed |
|---|---|---|
| `LEGAL_ENTITY_NAME` | Privacy §1, §15; Terms §21 | The formal registered company name (may differ from the "Mahaly" trading name) |
| `COUNTRY_OF_OPERATION` | Privacy §15; Terms §21 | Confirm — the app's address/phone/currency conventions strongly imply Egypt, but this hasn't been stated as an official legal fact anywhere in the codebase |
| `REGISTERED_ADDRESS` | Privacy §15; Terms §21 | Legal registered address |
| `PRIVACY_EMAIL` | Privacy §4, §9, §10, §11, §15 | A monitored privacy-request inbox (may be the same as `SUPPORT_EMAIL`) |
| `SUPPORT_EMAIL` | Privacy §15; Terms §21 | Public support contact address |
| `DATA_RETENTION_PERIOD_OR_CRITERIA` | Privacy §6 | Concrete retention periods or criteria |
| `MINIMUM_AGE` | Privacy §11; Terms §2 | Minimum account age |
| `APPLICABLE_PRIVACY_AUTHORITY` | Privacy §8 | Which international-transfer safeguard/mechanism applies |
| `RETURN_WINDOW` | Terms §9 | Number of days customers have to return an item |
| `CANCELLATION_RULES` | Terms §8 | Failed-delivery / re-delivery rules |
| `GOVERNING_LAW` | Terms §19 | Which jurisdiction's law governs |
| `COURT_OR_DISPUTE_FORUM` | Terms §19 | Where disputes are resolved |
| `EFFECTIVE_DATE` | Hero row, both pages | When this policy version takes effect |
| `LAST_UPDATED_DATE` | Hero row, both pages | When this policy version was last revised |

`TRADING_NAME` is **not** a placeholder — it's filled in with "Mahaly", the
site's real public brand name, per the task's "use verified existing
public brand information" guidance.

## One-off items (not in the shared registry — need direct legal review)

- **`[DATA_SALE_POLICY_PENDING_CONFIRMATION]`** (Privacy §4, "How We Share
  Information") — the policy does *not* assert "we do not sell personal
  information," per instruction, since that wasn't confirmed as accurate.
  The owner/counsel needs to supply the real commitment and its exact
  wording before publication.
- **`[INDEMNITY_CLAUSE_PENDING_LEGAL_REVIEW]`** (Terms §18, "Indemnity") —
  a narrow, reasonable indemnity clause is drafted, but flagged for legal
  review before publication rather than treated as final, since an
  indemnity clause's scope has real legal consequences.

## Footer labels with no real destination yet

`/returns`, `/shipping`, `/contact`, `/collections`, `/gift-cards`,
`/local-guides`, an "Our mission" page, `/careers`, `/press`, a Beauty
category, "Edits", "Egyptian Makers", "Seller Guidelines", "Brand
Support", "Our Story" (as a standalone page), "Sustainability", and real
social-media profile URLs — **none of these exist in the project.**
`Footer.tsx`'s `FOOTER_HREFS` and `BrandFooter.tsx`'s `LINK_HREFS` only map
labels with a confirmed, accurate destination; every other label renders
as plain non-interactive text (`aria-disabled="true"`, no `href`) instead
of a dead `href="#"` link, and `BrandFooter.tsx`'s three social icons
render as inert (non-`<a>`) icons for the same reason. No placeholder
page was created for any of these — building them is a separate task.

- **No Cookie Policy page exists.** The Privacy Policy's Cookies section
  says so explicitly rather than linking to a page that doesn't exist, and
  no "Cookie Policy" label is rendered anywhere in either footer.
- **`content/settings.ts`'s `DEFAULT_CONTACT_INFO`/`DEFAULT_SHIPPING_SETTINGS`**
  (admin-editable via `/admin/settings`) hold a placeholder support email/
  phone/address and a 30-day return window, but nothing on the public site
  actually renders them yet (the audit found `/admin/settings` claims "these
  show up in the site footer," but the footer never reads `site_content`).
  Once the return window and support contact are confirmed for real, this
  existing admin-editable data could become the actual source of truth for
  `[RETURN_WINDOW]` and `[SUPPORT_EMAIL]` instead of a static config value —
  flagging as a natural follow-up, not done here.
