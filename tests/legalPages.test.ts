import test from "node:test";
import assert from "node:assert/strict";
import { PRIVACY_SECTIONS } from "../content/legal/privacy.ts";
import { TERMS_SECTIONS } from "../content/legal/terms.ts";
import { isUnresolvedPlaceholder } from "../config/legal.ts";
import type { LegalSection } from "../types/index.ts";

function assertUniqueIds(sections: LegalSection[], label: string) {
  const ids = sections.map((s) => s.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length, `${label}: duplicate section id found among ${JSON.stringify(ids)}`);
}

function assertSlugLikeIds(sections: LegalSection[], label: string) {
  for (const section of sections) {
    assert.match(section.id, /^[a-z0-9-]+$/, `${label}: "${section.id}" must be a lowercase, hyphenated slug for stable deep-linking`);
  }
}

function assertNonEmptyBody(sections: LegalSection[], label: string) {
  for (const section of sections) {
    assert.ok(section.body.length > 0, `${label}: "${section.id}" has no content blocks`);
    assert.ok(section.title.trim().length > 0, `${label}: "${section.id}" has an empty title`);
  }
}

test("Privacy Policy has exactly 15 sections with unique, slug-like, non-empty ids", () => {
  assert.equal(PRIVACY_SECTIONS.length, 15);
  assertUniqueIds(PRIVACY_SECTIONS, "privacy");
  assertSlugLikeIds(PRIVACY_SECTIONS, "privacy");
  assertNonEmptyBody(PRIVACY_SECTIONS, "privacy");
});

test("Terms & Conditions has exactly 21 sections with unique, slug-like, non-empty ids", () => {
  assert.equal(TERMS_SECTIONS.length, 21);
  assertUniqueIds(TERMS_SECTIONS, "terms");
  assertSlugLikeIds(TERMS_SECTIONS, "terms");
  assertNonEmptyBody(TERMS_SECTIONS, "terms");
});

test("Privacy Policy ids do not collide with Terms & Conditions ids", () => {
  // Both pages share LegalToc/LegalAccordion id-based anchor logic — a
  // collision wouldn't break either page individually, but is worth
  // catching since it would mean the two content files drifted from their
  // intended distinct id namespaces.
  const privacyIds = new Set(PRIVACY_SECTIONS.map((s) => s.id));
  const overlap = TERMS_SECTIONS.map((s) => s.id).filter((id) => privacyIds.has(id));
  assert.deepEqual(overlap, [], `unexpected shared ids between privacy and terms: ${overlap.join(", ")}`);
});

test("isUnresolvedPlaceholder recognizes bracketed tokens and rejects normal text", () => {
  assert.equal(isUnresolvedPlaceholder("[LEGAL_ENTITY_NAME]"), true);
  assert.equal(isUnresolvedPlaceholder("[DATA_SALE_POLICY_PENDING_CONFIRMATION]"), true);
  assert.equal(isUnresolvedPlaceholder("Mahaly"), false);
  assert.equal(isUnresolvedPlaceholder("contact us at support@example.com"), false);
  assert.equal(isUnresolvedPlaceholder(""), false);
});

test("every [BRACKET] token referenced in the legal content is flagged as an unresolved placeholder", () => {
  const allText = JSON.stringify([...PRIVACY_SECTIONS, ...TERMS_SECTIONS]);
  const tokens = allText.match(/\[[^[\]]+\]/g) ?? [];
  assert.ok(tokens.length > 0, "expected at least one placeholder token across both legal pages");
  for (const token of tokens) {
    assert.ok(isUnresolvedPlaceholder(token), `"${token}" looks bracketed but isn't recognized as a placeholder`);
  }
});
