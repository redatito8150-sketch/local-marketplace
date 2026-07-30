import assert from "node:assert/strict";
import test from "node:test";
import { isWithinNewArrivalWindow, NEW_ARRIVAL_WINDOW_DAYS } from "../lib/newArrivals.ts";

test("isWithinNewArrivalWindow: a just-published product is New", () => {
  assert.equal(isWithinNewArrivalWindow("published", new Date().toISOString()), true);
});

test("isWithinNewArrivalWindow: a product published 19 days ago is still New", () => {
  const publishedAt = new Date(Date.now() - 19 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(isWithinNewArrivalWindow("published", publishedAt), true);
});

test("isWithinNewArrivalWindow: a product published 21 days ago is no longer New", () => {
  const publishedAt = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(isWithinNewArrivalWindow("published", publishedAt), false);
});

test("isWithinNewArrivalWindow: a Draft or Archived product is never New, regardless of publishDate", () => {
  const recentlyPublished = new Date().toISOString();
  assert.equal(isWithinNewArrivalWindow("draft", recentlyPublished), false);
  assert.equal(isWithinNewArrivalWindow("archived", recentlyPublished), false);
});

test("isWithinNewArrivalWindow: no publishDate at all is never New", () => {
  assert.equal(isWithinNewArrivalWindow("published", null), false);
  assert.equal(isWithinNewArrivalWindow("published", undefined), false);
});

test("isWithinNewArrivalWindow: the window is exactly 20 days", () => {
  assert.equal(NEW_ARRIVAL_WINDOW_DAYS, 20);
});
