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

## Other things worth the owner's attention (found during the audit, not fixed here — out of this task's scope)

- **No `/returns` or `/shipping` page exists yet.** The footer's "Shipping
  & returns" (main `Footer.tsx`) and "Shipping"/"Returns" (`BrandFooter.tsx`)
  labels still point nowhere (`href="#"`) — left as-is since building those
  pages is a separate task, not part of this Privacy/Terms redesign.
- **No `/contact` or help-center page exists yet** — same reasoning;
  footer "Contact us" links are still `href="#"`.
- **No Cookie Policy page exists.** The Privacy Policy's Cookies section
  says so explicitly rather than linking to a page that doesn't exist.
- **`content/settings.ts`'s `DEFAULT_CONTACT_INFO`/`DEFAULT_SHIPPING_SETTINGS`**
  (admin-editable via `/admin/settings`) hold a placeholder support email/
  phone/address and a 30-day return window, but nothing on the public site
  actually renders them yet (the audit found `/admin/settings` claims "these
  show up in the site footer," but the footer never reads `site_content`).
  Once the return window and support contact are confirmed for real, this
  existing admin-editable data could become the actual source of truth for
  `[RETURN_WINDOW]` and `[SUPPORT_EMAIL]` instead of a static config value —
  flagging as a natural follow-up, not done here.
