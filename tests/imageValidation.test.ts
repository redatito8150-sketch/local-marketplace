import test from "node:test";
import assert from "node:assert/strict";
import {
  hasExpectedDocumentSignature,
  hasExpectedImageSignature,
  isCanonicalProductFolderId,
  isUuid,
} from "../lib/uploads/imageValidation.ts";

test("accepts canonical product IDs and rejects path-like values", () => {
  assert.equal(isCanonicalProductFolderId("linen-shirt-01"), true);
  assert.equal(isCanonicalProductFolderId("../other-brand"), false);
  assert.equal(isCanonicalProductFolderId("folder/child"), false);
  assert.equal(isCanonicalProductFolderId(""), false);
});

test("recognizes UUID upload sessions", () => {
  assert.equal(isUuid("9f105bb3-da1e-4339-bff8-f49d6b072f70"), true);
  assert.equal(isUuid("temporary-folder"), false);
});

test("checks image signatures instead of trusting MIME alone", async () => {
  const png = new File(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    "image.png",
    { type: "image/png" }
  );
  const disguisedText = new File(["not an image"], "fake.png", { type: "image/png" });
  assert.equal(await hasExpectedImageSignature(png), true);
  assert.equal(await hasExpectedImageSignature(disguisedText), false);
});

test("checks document signatures for brand application uploads (PDF + image fallback)", async () => {
  const pdf = new File(
    [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])],
    "registration.pdf",
    { type: "application/pdf" }
  );
  const disguisedPdf = new File(["not a pdf"], "fake.pdf", { type: "application/pdf" });
  const png = new File(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    "logo.png",
    { type: "image/png" }
  );

  assert.equal(await hasExpectedDocumentSignature(pdf), true);
  assert.equal(await hasExpectedDocumentSignature(disguisedPdf), false);
  assert.equal(await hasExpectedDocumentSignature(png), true);
});
