import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  findUnresolvedPlaceholders,
  assertNoUnresolvedPlaceholders,
  UnresolvedLegalPlaceholdersError,
} from "../lib/legal/validateLegalContent.ts";
import {
  findUnresolvedLegalContentPlaceholders,
  assertLegalContentIsProductionReady,
} from "../lib/legal/legalContentStatus.ts";
import type { LegalSection } from "../types/index.ts";

const RESOLVED_SECTIONS: LegalSection[] = [
  {
    id: "example",
    title: "Example Section",
    body: [
      { type: "paragraph", text: "Everything here is confirmed real copy." },
      { type: "subheading", text: "A subheading" },
      { type: "list", items: ["First confirmed item", "Second confirmed item"] },
    ],
  },
];

const UNRESOLVED_SECTIONS: LegalSection[] = [
  {
    id: "example",
    title: "Example Section",
    body: [
      { type: "paragraph", text: "Contact us at [SUPPORT_EMAIL] for details." },
      { type: "list", items: ["Governed by [GOVERNING_LAW]", "A confirmed item"] },
    ],
  },
];

test("findUnresolvedPlaceholders returns nothing for fully resolved content", () => {
  const result = findUnresolvedPlaceholders([{ sections: RESOLVED_SECTIONS, strings: ["A confirmed intro paragraph."] }]);
  assert.deepEqual(result, []);
});

test("findUnresolvedPlaceholders finds bracket tokens in paragraphs, lists, and plain strings", () => {
  const result = findUnresolvedPlaceholders([
    { sections: UNRESOLVED_SECTIONS, strings: ["Effective [EFFECTIVE_DATE]"] },
  ]);
  assert.deepEqual(result, ["[EFFECTIVE_DATE]", "[GOVERNING_LAW]", "[SUPPORT_EMAIL]"]);
});

test("findUnresolvedPlaceholders de-duplicates repeated tokens", () => {
  const result = findUnresolvedPlaceholders([
    { strings: ["[SUPPORT_EMAIL] appears twice: [SUPPORT_EMAIL]"] },
  ]);
  assert.deepEqual(result, ["[SUPPORT_EMAIL]"]);
});

test("assertNoUnresolvedPlaceholders does not throw for fully resolved content", () => {
  assert.doesNotThrow(() => assertNoUnresolvedPlaceholders([{ sections: RESOLVED_SECTIONS }]));
});

test("assertNoUnresolvedPlaceholders throws UnresolvedLegalPlaceholdersError listing every token", () => {
  assert.throws(
    () => assertNoUnresolvedPlaceholders([{ sections: UNRESOLVED_SECTIONS }]),
    (error: unknown) => {
      assert.ok(error instanceof UnresolvedLegalPlaceholdersError);
      assert.deepEqual(error.placeholders, ["[GOVERNING_LAW]", "[SUPPORT_EMAIL]"]);
      assert.match(error.message, /\[GOVERNING_LAW\]/);
      assert.match(error.message, /\[SUPPORT_EMAIL\]/);
      return true;
    }
  );
});

test("the real /privacy and /terms content currently has unresolved placeholders (production-readiness not yet reached)", () => {
  // This is expected to fail loudly once every value in config/legal.ts
  // (and the two one-off tokens) is filled in for real — at that point,
  // update this test to assert an empty array instead, proving the page
  // is production-ready.
  const unresolved = findUnresolvedLegalContentPlaceholders();
  assert.ok(unresolved.length > 0, "expected at least one unresolved placeholder in the current legal content");
  assert.ok(unresolved.includes("[LEGAL_ENTITY_NAME]"));
  assert.ok(unresolved.includes("[GOVERNING_LAW]"));
});

test("assertLegalContentIsProductionReady throws against the current (unresolved) live content", () => {
  assert.throws(() => assertLegalContentIsProductionReady(), UnresolvedLegalPlaceholdersError);
});

// Integration coverage for scripts/validate-legal-content.mjs itself. Local
// and Preview builds stay usable, while Production fails closed.
const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const scriptPath = path.join(rootDir, "scripts/validate-legal-content.mjs");

function runValidateScript(env: Record<string, string>) {
  return spawnSync(process.execPath, [scriptPath], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

test("validate-legal-content.mjs succeeds by default despite unresolved placeholders", () => {
  const result = runValidateScript({ VERCEL_ENV: "", LEGAL_CONTENT_STRICT: "", LEGAL_CONTENT_ALLOW_UNRESOLVED: "" });
  assert.equal(result.status, 0);
  assert.match(result.stderr + result.stdout, /unresolved legal placeholder/i);
  assert.match(result.stderr + result.stdout, /not blocking this build/i);
});

test("validate-legal-content.mjs blocks a simulated Production build", () => {
  const result = runValidateScript({ VERCEL_ENV: "production", LEGAL_CONTENT_STRICT: "", LEGAL_CONTENT_ALLOW_UNRESOLVED: "" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /BUILD BLOCKED/);
});

test("validate-legal-content.mjs can enforce the gate outside Production", () => {
  const result = runValidateScript({ LEGAL_CONTENT_STRICT: "true", LEGAL_CONTENT_ALLOW_UNRESOLVED: "" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /BUILD BLOCKED/);
});

test("validate-legal-content.mjs allows an explicit development-only Production override", () => {
  const result = runValidateScript({
    VERCEL_ENV: "production",
    LEGAL_CONTENT_STRICT: "",
    LEGAL_CONTENT_ALLOW_UNRESOLVED: "true",
  });
  assert.equal(result.status, 0);
  assert.match(result.stderr + result.stdout, /EXPLICIT DEVELOPMENT OVERRIDE ACTIVE/i);
});

test("LEGAL_CONTENT_STRICT still blocks when the development override is present", () => {
  const result = runValidateScript({
    VERCEL_ENV: "production",
    LEGAL_CONTENT_STRICT: "true",
    LEGAL_CONTENT_ALLOW_UNRESOLVED: "true",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /BUILD BLOCKED/);
});
