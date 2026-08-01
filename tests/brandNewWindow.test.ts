import test from "node:test";
import assert from "node:assert/strict";
import { isWithinNewBrandWindow, BRAND_NEW_WINDOW_DAYS } from "../lib/brandNewWindow.ts";

test("a brand created today, and active, is within the New window", () => {
  assert.equal(isWithinNewBrandWindow(new Date().toISOString(), true), true);
});

test("a brand created before the window is not New", () => {
  const old = new Date(Date.now() - (BRAND_NEW_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(isWithinNewBrandWindow(old, true), false);
});

test("an inactive brand is never New, regardless of age", () => {
  assert.equal(isWithinNewBrandWindow(new Date().toISOString(), false), false);
});

test("a missing or invalid createdAt is never New", () => {
  assert.equal(isWithinNewBrandWindow(undefined, true), false);
  assert.equal(isWithinNewBrandWindow("not a date", true), false);
});
