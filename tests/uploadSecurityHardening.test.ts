import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import sharp from "sharp";
import {
  prepareSafeApplicationDocument,
  safeDocumentDisplayName,
} from "../lib/uploads/applicationDocument.ts";
import { prepareSafeImageUpload } from "../lib/uploads/imageValidation.ts";

const IMAGE_LIMIT = 5 * 1024 * 1024;

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function validPngBytes(): Promise<Uint8Array> {
  const bytes = await sharp({
    create: {
      background: { alpha: 1, b: 80, g: 120, r: 180 },
      channels: 4,
      height: 8,
      width: 8,
    },
  })
    .png()
    .toBuffer();
  return Uint8Array.from(bytes);
}

test("fully decodes images and rejects a PHP payload disguised by MIME and double extension", async () => {
  const disguised = new File(["<?php echo 'owned'; ?>"], "shell.php.png", { type: "image/png" });
  const result = await prepareSafeImageUpload(disguised, {
    allowedMimeTypes: ["image/png"],
    maxBytes: IMAGE_LIMIT,
  });
  assert.equal(result.ok, false);
});

test("accepts a real double-extension image but stores only normalized pixels and a canonical extension", async () => {
  const original = await validPngBytes();
  const payload = new TextEncoder().encode("<?php echo 'polyglot'; ?><script>alert(1)</script>");
  const polyglot = new File([asArrayBuffer(original), asArrayBuffer(payload)], "catalog.php.png", {
    type: "image/png",
  });
  const result = await prepareSafeImageUpload(polyglot, {
    allowedMimeTypes: ["image/png"],
    maxBytes: IMAGE_LIMIT,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.upload.extension, "png");
  assert.equal(result.upload.mimeType, "image/png");
  assert.doesNotMatch(new TextDecoder("latin1").decode(result.upload.bytes), /<\?php|<script/i);
  const metadata = await sharp(result.upload.bytes).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 8);
  assert.equal(metadata.height, 8);
});

test("rejects corrupt image data even when its magic bytes and claimed MIME match", async () => {
  const headerOnly = new File(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "not-a-real-png"],
    "broken.png",
    { type: "image/png" }
  );
  const result = await prepareSafeImageUpload(headerOnly, {
    allowedMimeTypes: ["image/png"],
    maxBytes: IMAGE_LIMIT,
  });
  assert.equal(result.ok, false);
});

test("decodes and re-encodes every image format allowed by the public media buckets", async () => {
  const formats = [
    ["image/jpeg", "jpeg", "jpg"],
    ["image/png", "png", "png"],
    ["image/webp", "webp", "webp"],
    ["image/avif", "avif", "avif"],
  ] as const;
  for (const [mimeType, sharpFormat, extension] of formats) {
    const bytes = await sharp({
      create: { background: { alpha: 1, b: 30, g: 20, r: 10 }, channels: 4, height: 4, width: 4 },
    })
      [sharpFormat]()
      .toBuffer();
    const file = new File([asArrayBuffer(bytes)], `image.${sharpFormat}`, { type: mimeType });
    const result = await prepareSafeImageUpload(file, {
      allowedMimeTypes: [mimeType],
      maxBytes: IMAGE_LIMIT,
    });
    assert.equal(result.ok, true, `${mimeType} should be accepted`);
    if (result.ok) assert.equal(result.upload.extension, extension);
  }
});

test("rebuilds Brand Application PDFs without document actions, annotations or trailing payloads", async () => {
  const source = await PDFDocument.create();
  const page = source.addPage([300, 300]);
  source.catalog.set(PDFName.of("OpenAction"), PDFString.of("javascript:alert(1)"));
  page.node.set(PDFName.of("Annots"), source.context.obj([]));
  const sourceBytes = await source.save({ useObjectStreams: false });
  const payload = new TextEncoder().encode("<?php echo 'payload'; ?>");
  const file = new File([asArrayBuffer(sourceBytes), asArrayBuffer(payload)], "registration.php.pdf", {
    type: "application/pdf",
  });

  const result = await prepareSafeApplicationDocument(file, 10 * 1024 * 1024);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.upload.extension, "pdf");
  assert.equal(result.upload.mimeType, "application/pdf");
  assert.doesNotMatch(new TextDecoder("latin1").decode(result.upload.bytes), /<\?php/i);

  const rebuilt = await PDFDocument.load(result.upload.bytes);
  assert.equal(rebuilt.catalog.has(PDFName.of("OpenAction")), false);
  assert.equal(rebuilt.getPages()[0].node.has(PDFName.of("Annots")), false);
});

test("rejects fake PDFs and removes misleading extensions and bidi controls from display names", async () => {
  const fake = new File(["%PDF-not-a-document\n%%EOF"], "invoice.pdf", { type: "application/pdf" });
  const result = await prepareSafeApplicationDocument(fake, 10 * 1024 * 1024);
  assert.equal(result.ok, false);
  assert.equal(safeDocumentDisplayName("invoice.php.\u202egnp.pdf", "pdf"), "invoice-php-gnp.pdf");
});

test("every upload route uses the centralized safe preparation boundary", async () => {
  const imageRoutes = [
    "app/api/account/avatar/route.ts",
    "app/api/admin/page-studio/assets/route.ts",
    "app/api/admin/products/images/route.ts",
    "app/api/brands/[slug]/collections/[id]/cover-image/route.ts",
    "app/api/brands/[slug]/image/route.ts",
    "app/api/reviews/route.ts",
  ];
  for (const route of imageRoutes) {
    const source = await readFile(route, "utf8");
    assert.match(source, /prepareSafeImageUpload/);
    assert.doesNotMatch(source, /contentType:\s*file\.type/);
  }

  const applicationRoute = await readFile("app/api/join/application/documents/route.ts", "utf8");
  assert.match(applicationRoute, /prepareSafeApplicationDocument/);
  assert.match(applicationRoute, /randomUUID\(\)/);
  assert.match(applicationRoute, /MAX_ACTIVE_APPLICATION_DOCUMENTS/);
  assert.match(applicationRoute, /application\.status !== "draft"/);
  assert.doesNotMatch(applicationRoute, /contentType:\s*file\.type/);

  const avatarRoute = await readFile("app/api/account/avatar/route.ts", "utf8");
  assert.match(avatarRoute, /account-avatar-upload/);
});

test("admin document access forces an opaque no-sniff download instead of returning a raw signed URL", async () => {
  const route = await readFile(
    "app/api/admin/applications/[id]/documents/[docId]/signed-url/route.ts",
    "utf8"
  );
  assert.match(route, /\.download\(doc\.storage_path\)/);
  assert.match(route, /Content-Disposition/);
  assert.match(route, /application\/octet-stream/);
  assert.match(route, /X-Content-Type-Options/);
  assert.match(route, /nosniff/);
  assert.match(route, /Content-Security-Policy/);
  assert.doesNotMatch(route, /createSignedUrl/);
});
