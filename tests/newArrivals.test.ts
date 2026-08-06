import assert from "node:assert/strict";
import test from "node:test";
import { isWithinNewArrivalWindow, NEW_ARRIVAL_WINDOW_DAYS, isPublishDateLive, publishDateLiveFilter } from "../lib/newArrivals.ts";

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

// Scheduled publishing: status: "published" alone used to make a product
// fully live regardless of a future publish_date — these lock in the fix.
test("isPublishDateLive: no publish_date at all is live (nothing scheduled)", () => {
  assert.equal(isPublishDateLive(null), true);
  assert.equal(isPublishDateLive(undefined), true);
});

test("isPublishDateLive: a past or current publish_date is live", () => {
  assert.equal(isPublishDateLive(new Date(Date.now() - 1000).toISOString()), true);
});

test("isPublishDateLive: a future publish_date is not live yet", () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  assert.equal(isPublishDateLive(future), false);
});

test("publishDateLiveFilter: produces a PostgREST or() filter matching null-or-past publish_date", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(publishDateLiveFilter(now), "publish_date.is.null,publish_date.lte.2026-01-01T00:00:00.000Z");
});
