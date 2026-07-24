# Brand Application System Redesign — Deliverables Report

**Branch:** `feature/brand-application-redesign` (from `main`)
**Status:** Code-complete (Milestones 1–8). **Not yet live-verified** — the
database migration has not been applied to the live Supabase project. See
"Outstanding manual step" below before treating anything here as working.

## 1. Summary

Rebuilt `/join-as-a-brand/apply` from a public, single-step, unauthenticated
form into an authenticated, resumable, 5-step application workflow with
legal/document collection, a database-enforced one-active-application limit,
a full admin review workflow (validated status transitions, required
rejection/changes-requested reasons, an account-vs-application info
comparison, document access via signed URLs), an atomic
approve-to-brand-creation flow, and applicant-facing email at every status
transition.

## 2. Architecture decisions

- **Auth is now required** to start or submit an application (the public
  intro page `/join-as-a-brand` is unchanged). This was an explicit,
  confirmed change from today's guest-submission behavior — see "Conflicts
  with the original brief" in the approved plan.
- **No new RLS write policies** on `brand_applications` or its two new
  supporting tables. Every read/write goes through service-role-backed
  Next.js routes gated by `requireUser()`/`requireAdminUser()`, matching
  this project's existing convention for `orders`/`addresses`/`profiles`.
  Column-level protection (an applicant can edit their own draft but never
  set `status`/`admin_notes`/`applicant_user_id` themselves) isn't
  expressible in row-level RLS alone, so it's enforced in application code.
- **English-only**, no next-intl/locale routing/translation framework —
  confirmed with you mid-plan (the original brief's next-intl premise was
  wrong; this repo has no i18n at all). Copy is kept in named
  constants/label maps (`lib/join/constants.ts`, `lib/admin/statuses.ts`)
  rather than scattered inline strings, so a future localization pass is
  cheaper, not so it can be silently swapped later.
- **Zod**, added as this project's first schema-validation library, scoped
  to this feature (`lib/join/validation.ts`). Server routes remain the
  authoritative validator regardless — client-side validation is UX only.
- **Legacy rows** (pre-auth submissions, `applicant_user_id IS NULL`) are
  preserved read-only, never backfilled with a guessed identity, and shown
  as "Legacy submission (pre-auth)" in the admin detail page.
- **No new customer-notification table.** Applicant-facing updates go
  through the existing Resend email integration
  (`lib/email/templates/brandApplication.ts`); admin-facing alerts reuse the
  existing `notify()`/Discord path.

## 3. Files touched (by milestone)

**Milestone 1 — schema**
- `supabase/migrations/20260725000001_brand_application_workflow.sql` (new)
- `supabase/schema.sql` (hand-maintained doc, kept in sync)
- `types/index.ts` (expanded `ApplicationStatus`, new `ApplicantRole`/
  `LegalStatus`/`ApplicantAccountSnapshot`/`BrandApplicationDocumentRecord`/
  `BrandApplicationStatusHistoryEntry`, expanded `BrandApplicationRecord`)

**Milestone 2 — services/validation**
- `lib/join/constants.ts` (new) — option lists, status-transition map,
  cooldown constant + pure cooldown helpers, document-upload constants
- `lib/join/validation.ts` (new) — Zod schemas per step + merged
  submit/draft schemas
- `lib/join/applicationService.ts` (new) — service-role-backed
  `getMyApplication`/`createOrUpdateDraft`/`submitApplication`/
  `withdrawApplication`/`getApplicationDocuments`/
  `getApplicationStatusHistory`/row mappers
- `package.json` — added `zod`

**Milestone 3 — applicant UI**
- `components/join/ApplyBrandForm.tsx` (rewritten) — 5-step wizard
- `components/join/ApplicationStatusView.tsx` (new) — non-editable-status view
- `lib/join/clientApi.ts` (new) — typed fetch wrappers
- `app/join-as-a-brand/apply/page.tsx` (rewritten) — auth gate + prefetch
- `app/api/join/application/route.ts` (new) — GET/POST own application
- `app/api/join/application/submit/route.ts` (new)
- `app/api/join/application/withdraw/route.ts` (new)
- `app/api/join/application/documents/route.ts` (new) — GET/POST documents
- `lib/uploads/imageValidation.ts` — added `hasExpectedDocumentSignature`
- **Removed:** `app/api/join/apply/route.ts`, `lib/join/submitApplication.ts`
  (the old public form/route — replaced, not extended, per the confirmed
  auth-required decision)

**Milestone 5 — admin review**
- `app/api/admin/applications/[id]/route.ts` (reworked) — validated
  transitions, required reasons, notes-only updates
- `app/api/admin/applications/[id]/documents/[docId]/signed-url/route.ts` (new)
- `app/admin/applications/[id]/page.tsx` (reworked) — full field display,
  account-vs-application diff, status history, documents, notes
- `components/admin/ApplicationTransitionPanel.tsx` (new)
- `components/admin/ApplicationAdminNotes.tsx` (new)
- `components/admin/ApplicationDocumentsList.tsx` (new)
- `lib/data/admin.ts` — application mapper now reuses
  `applicationService.ts`'s `toBrandApplicationRecord` instead of a
  duplicated, stale 10-field version
- `lib/admin/statuses.ts` — extended to the full 10-value status lifecycle

**Milestone 6 — approve → create brand**
- `app/admin/brands/new/page.tsx` (reworked) — `?applicationId=` support
- `components/admin/BrandForm.tsx` — `prefill`/`sourceApplicationId` props
- `app/api/admin/brands/route.ts` — calls `convert_application_to_brand()`
  when `sourceApplicationId` is present
- `lib/auditLog.ts` — added `reject`/`withdraw`/`convert_to_brand` actions

**Milestone 7 — email**
- `lib/email/templates/brandApplication.ts` (new) — 6 lifecycle templates
- Wired into the submit, admin PATCH, and brand-conversion routes

**Milestone 8 — tests**
- `tests/joinValidation.test.ts` (new) — Zod schema + transition-map +
  cooldown-helper unit tests
- `tests/imageValidation.test.ts` — added document-signature tests
- `tests/security.rls.test.ts` — added an anon-key-rejection check for
  `convert_application_to_brand` (self-skips until the migration is applied)
- This document

## 4. Database changes

See `supabase/migrations/20260725000001_brand_application_workflow.sql` for
the authoritative SQL. Summary:

- ~35 new columns on `brand_applications` (applicant identity/role, full
  brand/legal/operations detail, consent flags, review metadata,
  reapplication cooldown fields, `applicant_account_snapshot jsonb`,
  `updated_at` + trigger).
- Status check constraint replaced with the 10-value lifecycle (`draft →
  submitted → under_review → changes_requested/resubmitted →
  approved_pending_creation/approved → converted_to_brand`, plus
  `rejected`/`withdrawn`), with a backfill of the 4 legacy values.
- Two new tables: `brand_application_documents`,
  `brand_application_status_history` — RLS enabled, no public policies
  (service-role only, matching this table's existing convention).
- New private storage bucket `brand-application-documents` + 3
  `storage.objects` RLS policies (applicant reads/writes only their own
  `${userId}/${applicationId}/...` prefix; admin reads all).
- New `security definer` RPC `convert_application_to_brand()` — atomic
  brand insert + application conversion, revoked from `anon`/`authenticated`,
  granted to `service_role` only. Its brand-insert column list was
  widened during Milestone 6 to also include `logo_image`/`website_url`/
  `story_image_2`/`shop_the_look` (added by an earlier, separate migration
  that the first draft of this RPC had missed), so a converted brand has
  full parity with one created through the normal admin form.

## 5. One-application-per-user limit — how it's actually enforced

The real guarantee is a **partial unique index**, not application code:

```sql
create unique index brand_applications_one_active_per_user
  on brand_applications (applicant_user_id)
  where status in ('draft','submitted','under_review','changes_requested',
                    'resubmitted','approved_pending_creation');
```

A second insert/transition into an active status for the same user fails at
the constraint level regardless of race conditions. `applicationService.ts`'s
`createOrUpdateDraft()` still pre-checks the applicant's most recent
application first, for a friendly error instead of a raw `23505`, and
distinguishes three cases:
1. Existing application is **active but not editable** (submitted, under
   review, etc.) → blocks with `APPLICATION_NOT_EDITABLE`.
2. Existing application is **rejected, still within cooldown** → blocks
   with `REAPPLICATION_COOLDOWN_ACTIVE` (30 days by default,
   `lib/join/constants.ts#REAPPLICATION_COOLDOWN_DAYS`, overridable per-row
   via `reapplication_override`/admin-adjusted `reapplication_allowed_at`).
3. Existing application is **terminal and clear** (rejected past cooldown,
   withdrawn, approved, converted) → a fresh row is created instead of
   editing the old one.

## 6. Approve → Create Brand — how it's atomic

`POST /api/admin/brands` accepts an optional `sourceApplicationId`. When
present, instead of a plain `insert`, it calls `convert_application_to_brand`
(admin-only, service-role), which — in one transaction — locks the
application row, validates it's `approved`/`approved_pending_creation` and
not already converted, inserts the brand row, and updates the application to
`converted_to_brand` with `approved_brand_id`/`converted_at`/`converted_by`.
Calling it twice on an already-converted application raises
`ALREADY_CONVERTED` rather than creating a duplicate brand. `BrandForm` gets
a `prefill`/`sourceApplicationId` prop pair rather than a second form
component.

## 7. Outstanding manual step (blocks everything below from being verified)

The migration has **not** been applied to the live Supabase project —
confirmed via a direct REST query returning
`column brand_applications.applicant_user_id does not exist` and the
`brand-application-documents` bucket returning 404. Per this project's own
rule (no direct destructive/production SQL from the assistant), you need to:

1. Run `supabase/migrations/20260725000001_brand_application_workflow.sql`
   in the Supabase SQL editor.
2. Confirm the `brand-application-documents` bucket exists with **Public
   off** in Storage → Buckets (create it by hand if the migration's insert
   didn't take, same caveat as the existing `product-images` bucket).
3. Re-run `npm test` — `convert_application_to_brand rejects the public
   anon key` will stop skipping and actually assert once the function exists.

## 8. Manual testing steps (once the migration is applied)

1. Sign in as a disposable test customer account. Visit
   `/join-as-a-brand/apply` — should render the wizard (not redirect,
   since you're signed in).
2. Fill step 1–4, clicking Continue each time — confirm each step
   persists (`GET /api/join/application` should return the draft after a
   page reload mid-flow).
3. On step 3, upload a real PDF and a disguised-extension text file named
   `.pdf` — the real one should upload, the fake one should be rejected
   with "file content does not match its type".
4. Submit on step 5 — confirm the application flips to `submitted`, an
   email is attempted (check server logs if `RESEND_API_KEY` is unset —
   it should log-and-skip, not throw), and the same account can no longer
   start a second application (the wizard should show
   `ApplicationStatusView`, not the form).
5. As an admin, open `/admin/applications`, open the new submission, and
   walk it through `under_review → changes_requested` (reason required) →
   confirm the reason shows in "Applicant-facing messages on file" and the
   status-history timeline.
6. Move it to `approved`, click "Create brand" on the detail page, fill in
   the remaining required fields (slug, tagline, image URLs), submit —
   confirm a new brand appears at `/brands/<slug>` and the application shows
   `Converted to Brand` with a "View brand" link. Try submitting the same
   `?applicationId=` form again — should fail with "already been converted".
7. Reject a second disposable application with a reason — confirm
   `reapplication_allowed_at` is set ~30 days out and that account's next
   draft attempt is blocked with the cooldown message until an admin clears
   `reapplication_override`.

## 9. Commands

```bash
npm run build      # currently blocked by a pre-existing, unrelated
                    # FormData.get TypeScript error present on main —
                    # see the note below, not caused by this branch
npx tsc --noEmit -p tsconfig.json
npx eslint .
npm test
```

## 10. Required env vars

No new environment variables — reuses `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and `RESEND_API_KEY` (already documented in
`.env.local.example`). `RESEND_API_KEY` being unset degrades gracefully
(emails log-and-skip, nothing throws).

## 11. Risks, assumptions, follow-ups

- **`npm run build` currently fails** on a pre-existing TypeScript error
  (`Property 'get' does not exist on type 'FormData'`) in
  `app/api/account/avatar/route.ts` and two other existing routes —
  confirmed via `git stash` that this predates this branch entirely, not
  introduced here. `npx tsc --noEmit`/`npx eslint .`/`npm test` are all
  clean for this feature. Filed separately, not fixed as part of this task
  (out of scope, unrelated root cause — likely a `@types/node`/DOM global
  `FormData` conflict).
- **Nothing in Milestones 1–8 has been exercised against live data yet** —
  see section 7. Treat this as code-complete, not verified-working, until
  the migration runs and the manual testing steps above are done.
- **`lib/admin/statuses.ts`'s `APPLICATION_STATUSES` was widened** to the
  full 10-value lifecycle so the pre-existing admin list/detail pages kept
  compiling — but the *old* `PATCH` route (now reworked) previously let an
  admin set any of a 4-value enum with no transition validation at all.
  The new route validates transitions and requires reasons; there is no
  remaining unvalidated write path to this table from the admin side.
- **Reapplication cooldown default is 30 days**, defined once in
  `lib/join/constants.ts#REAPPLICATION_COOLDOWN_DAYS` — change it there if
  the business wants a different window; existing rows are unaffected
  until they're next rejected.
- **Email templates have no linked call-to-action URL** (no "sign in to
  continue" button) — this codebase has no established production-domain
  constant anywhere (checked `app/layout.tsx` and the existing order email
  templates), so rather than guess a domain I left the emails
  informational-only. Worth adding a real link once a canonical site URL
  env var exists.
- **Legacy (pre-auth) applications** have no `applicant_user_id` and will
  never show an account-vs-application diff or be reachable via
  `getMyApplication()` — this is intentional, not a bug, per the plan's
  explicit legacy-row handling.
