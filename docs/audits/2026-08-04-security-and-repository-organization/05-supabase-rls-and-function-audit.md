# Supabase RLS and Function Audit — 2026-08-04

## `SECURITY DEFINER` functions

54 `security definer` declarations exist across `supabase/migrations/*.sql`
and `supabase/schema.sql`. Every single one has a matching
`set search_path = public[, pg_temp]` on the same function — verified by
grepping both patterns file-by-file and manually diffing the counts (54
`security definer`, 57 `set search_path`; the 3 extra `search_path`
pins belong to non-`SECURITY DEFINER` trigger functions that pin it
defensively anyway). **No function was found with `SECURITY DEFINER` and
no pinned `search_path`** — this is the exact class of bug this part of
the audit spec asks about, and it's already fully covered.

Execution grants on the privileged mutation RPCs (`place_order`,
`cancel_order`, `set_default_address`, `set_user_access`,
`replace_product_with_variants`, `convert_application_to_brand`) were not
re-derived from the SQL text this pass — they were re-verified **live**
via `tests/security.rls.test.ts`, which calls each one with the anon key
and asserts `permission denied`. All 6 still reject the anon key (12/12
tests in that file passing, including the new RLS-016 regression test).

## RLS policy sweep

Searched every `using (true)` (and `USING (true)`) SELECT policy in
`supabase/schema.sql` and `supabase/migrations/*.sql`. Found 16 total
instances (case-insensitive), classified below:

| Table | Classification | Action |
|---|---|---|
| `product_options`, `product_option_values`, `product_variant_values`, `product_color_images` | **Real gap** — per-product data with no status predicate | **Fixed this pass** — `20260804000001_scope_product_child_table_rls.sql` (see `01-security-audit-report.md`, finding RLS-016). |
| `option_types`, `option_values` (original `using (true)` from `20260731000001`) | Already superseded | The very next migration (`20260801000001_inventory_variants_refinement.sql`) explicitly `drop policy if exists` on both and replaces them with a scoped policy (`brand_id is null or [owning brand] or [admin] or [used by a published product]`). Confirmed via grep that no later migration re-introduces the unscoped version. Not a live gap — the grep hit was against dead migration history, not the current policy. |
| `size_profiles`, `size_profile_values`, `taxonomy_size_profiles` | Not a gap | Shared, brand-agnostic size taxonomy (e.g. "EU 36-46"), not per-product or per-brand private data. Public readability is the intended design — the storefront size selector needs this for every product regardless of status, and it contains no brand- or product-identifying information. |
| `site_content` | Not a gap | Public CMS content by design (homepage hero, journal, etc.) — writes already require the service-role key server-side (no public INSERT/UPDATE policy exists, confirmed in `CLAUDE.md` and re-confirmed via grep — no `for insert`/`for update` policy on `site_content` in schema.sql). |

## `product_variants` schema.sql vs. live-migration discrepancy

`supabase/schema.sql` (the hand-maintained baseline, not auto-generated —
this is the pre-existing, already-documented `MIG-001` gap) still shows
`product_variants`'s original `using (true)` policy at line 550-552. The
*actual* live policy is the corrected one from
`20260722101910_security_boundaries.sql` (`drop policy ...; create
policy ... using (exists(select 1 from products p where ... status =
'published' and paused_by_brand = false))`), confirmed by migration
ordering (`20260722101910` runs after the `create table` in
`schema.sql`'s baseline, per the existing migration-application model).
**This is not a live vulnerability** — it's `schema.sql` merely being
stale documentation of a table that was later fixed by a migration — but
it is a concrete illustration of exactly the risk `MIG-001` already
describes: someone reading `schema.sql` alone (rather than replaying
every migration) would incorrectly conclude `product_variants` is still
wide open. No action taken this pass beyond documenting it here — fixing
`MIG-001` itself (regenerating `schema.sql` from the full migration
history, or deprecating it in favor of the migrations directory as the
single source of truth) is a larger architectural change already flagged
as a `NEXT` item in the original audit and re-flagged in
`08-deferred-risks-and-recommendations.md`.

## Constraints, foreign keys, idempotency

Not independently re-derived this pass — `docs/security-audit.md` and
`docs/full-platform-audit.md` already document the transactional/
idempotency work (`replace_product_with_variants`,
`next_product_sku` concurrency, `set_user_access`) and it's covered by
passing tests in `tests/security.rls.test.ts`'s bottom section
("basic-info-rebuild correction" tests — `next_product_sku` concurrency,
`sku_prefix` locking, cross-brand collection guard) and
`tests/openingStockInventory.test.ts` (opening-stock exactly-once,
atomic order history). All of those tests passed in this session's full
`npm test` run (253/253).

## Storage bucket policies

Not independently re-verified this pass (requires the Supabase dashboard,
not tracked in this repo — same limitation `docs/security-audit.md`'s
SEC-004 already notes: "Storage bucket-level RLS/policies... aren't
tracked in this repo and weren't independently re-verified"). Carried
forward as a documented limitation, not silently skipped.
