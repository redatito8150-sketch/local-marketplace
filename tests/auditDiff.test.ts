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

test("formatDiffAsText joins changes into readable lines, or returns undefined when empty", () => {
  assert.equal(formatDiffAsText([]), undefined);
  assert.equal(
    formatDiffAsText([{ field: "Name", from: "A", to: "B" }]),
    "Name: A → B"
  );
});
