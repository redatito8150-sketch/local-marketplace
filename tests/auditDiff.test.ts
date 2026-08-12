import test from "node:test";
import assert from "node:assert/strict";
import { diffEntitySnapshots, formatDiffAsText, formatFieldValue, humanizeFieldLabel } from "../lib/auditDiff.ts";

test("humanizeFieldLabel title-cases snake_case and camelCase alike", () => {
  assert.equal(humanizeFieldLabel("compare_at_price"), "Compare At Price");
  assert.equal(humanizeFieldLabel("brandSlug"), "Brand Slug");
});

test("formatFieldValue handles the common shapes", () => {
  assert.equal(formatFieldValue(null), "—");
  assert.equal(formatFieldValue(undefined), "—");
  assert.equal(formatFieldValue(true), "Yes");
  assert.equal(formatFieldValue(false), "No");
  assert.equal(formatFieldValue(1250), "1,250");
  assert.equal(formatFieldValue(["red", "blue"]), "red, blue");
  assert.equal(formatFieldValue("Hello"), "Hello");
});

test("diffEntitySnapshots only reports fields that actually changed", () => {
  const before = { name: "Old Name", price: 100, status: "draft" };
  const after = { name: "New Name", price: 100, status: "published" };
  const changes = diffEntitySnapshots(before, after);
  assert.deepEqual(
    changes.map((c) => c.field).sort(),
    ["Name", "Status"]
  );
  const nameChange = changes.find((c) => c.field === "Name")!;
  assert.equal(nameChange.from, "Old Name");
  assert.equal(nameChange.to, "New Name");
});

test("diffEntitySnapshots ignores bookkeeping fields and identical values", () => {
  const before = { id: "1", updated_at: "t1", price: 100 };
  const after = { id: "1", updated_at: "t2", price: 100 };
  assert.deepEqual(diffEntitySnapshots(before, after), []);
});

test("diffEntitySnapshots treats a create (no before) as all-new fields", () => {
  const changes = diffEntitySnapshots(undefined, { name: "Brand New" });
  assert.deepEqual(changes, [{ field: "Name", to: "Brand New" }]);
});

test("diffEntitySnapshots treats a delete (no after) as a snapshot of what existed", () => {
  const changes = diffEntitySnapshots({ name: "Gone" }, undefined);
  assert.deepEqual(changes, [{ field: "Name", from: "Gone" }]);
});

// The real bug this guards against: a partial-update route logs the FULL
// existing DB row as `before` (e.g. select("*")) against its own narrower
// patch object as `after` (e.g. brand-portal's brand-content editor, which
// only ever sends ~8 of the brands table's ~20 columns — hero_image, logo,
// owner_user_id, etc. are edited elsewhere and never included). A key
// merely absent from `after` must never render as "removed" — every real
// field-clearing case in this codebase uses an explicit `null` in `after`,
// which is a genuine change and must still show up.
test("diffEntitySnapshots does not report a key that's simply absent from a real (non-undefined) after object", () => {
  const before = { category: "Shoes", city: "Cairo", heroImage: "old.jpg", ownerUserId: "u1" };
  // A narrow patch route's `after` — only the fields it actually edits.
  const after = { category: "Bags", city: "Cairo" };
  const changes = diffEntitySnapshots(before, after);
  assert.deepEqual(changes.map((c) => c.field), ["Category"]);
  assert.equal(changes[0].from, "Shoes");
  assert.equal(changes[0].to, "Bags");
});

test("diffEntitySnapshots still reports a real, explicit clear-to-null as a change", () => {
  const before = { returnPolicy: "30 days" };
  const after = { returnPolicy: null };
  assert.deepEqual(diffEntitySnapshots(before, after), [
    { field: "Return Policy", from: "30 days", to: "—" },
  ]);
});

test("formatDiffAsText joins changes into readable lines, or returns undefined when empty", () => {
  assert.equal(formatDiffAsText([]), undefined);
  assert.equal(
    formatDiffAsText([{ field: "Name", from: "A", to: "B" }]),
    "Name: A → B"
  );
});
