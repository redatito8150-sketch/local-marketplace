import assert from "node:assert/strict";
import test from "node:test";
import { slugify, baseSkuPrefix, slugVariant, skuVariant } from "../lib/admin/brandAutoDerive.ts";

test("slugify: lowercases, hyphenates, strips punctuation", () => {
  assert.equal(slugify("Nabta Studio"), "nabta-studio");
  assert.equal(slugify("  Café & Co.  "), "caf-co");
});

test("slugify: never returns an empty string", () => {
  assert.equal(slugify("!!!"), "brand");
});

test("baseSkuPrefix: uppercases and strips non-alphanumerics, capped at 6 chars", () => {
  assert.equal(baseSkuPrefix("Nabta Studio"), "NABTAS");
  assert.equal(baseSkuPrefix("Nabta"), "NABTA");
});

test("baseSkuPrefix: pads up to the 2-char minimum for very short names", () => {
  const result = baseSkuPrefix("N");
  assert.ok(result.length >= 2);
  assert.match(result, /^[A-Z0-9]{2,6}$/);
});

test("slugVariant: attempt 0 is the plain base, later attempts append a numeric suffix", () => {
  assert.equal(slugVariant("nabta-studio", 0), "nabta-studio");
  assert.equal(slugVariant("nabta-studio", 1), "nabta-studio-2");
  assert.equal(slugVariant("nabta-studio", 2), "nabta-studio-3");
});

test("skuVariant: attempt 0 is the plain base, later attempts trim + suffix while staying in format", () => {
  assert.equal(skuVariant("NABTAS", 0), "NABTAS");
  const variant1 = skuVariant("NABTAS", 1);
  assert.match(variant1, /^[A-Z0-9]{2,6}$/);
  assert.ok(variant1.endsWith("2"));
});

test("skuVariant: stays within the 2-6 char DB format even for many attempts", () => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = skuVariant("NABTAS", attempt);
    assert.match(result, /^[A-Z0-9]{2,6}$/, `attempt ${attempt} produced "${result}"`);
  }
});
