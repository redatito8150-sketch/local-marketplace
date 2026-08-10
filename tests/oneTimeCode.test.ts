import assert from "node:assert/strict";
import test from "node:test";
import { isCompleteTotpCode, normalizeTotpCode } from "../lib/auth/oneTimeCode.ts";

test("normalizes pasted TOTP codes and limits them to six digits", () => {
  assert.equal(normalizeTotpCode("12 34-567"), "123456");
  assert.equal(normalizeTotpCode("code: 987654"), "987654");
});

test("accepts Arabic and Eastern Arabic numerals", () => {
  assert.equal(normalizeTotpCode("١٢٣٤٥٦"), "123456");
  assert.equal(normalizeTotpCode("۱۲۳۴۵۶"), "123456");
});

test("requires exactly six normalized digits", () => {
  assert.equal(isCompleteTotpCode("123456"), true);
  assert.equal(isCompleteTotpCode("12345"), false);
  assert.equal(isCompleteTotpCode("12345a"), false);
});
