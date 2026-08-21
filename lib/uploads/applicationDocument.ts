import { PDFDict, PDFDocument, PDFName, PDFStream } from "pdf-lib";
import {
  prepareSafeImageUpload,
  type PreparedImageUpload,
  type UploadPreparationResult,
} from "./imageValidation.ts";

const MAX_PDF_PAGES = 60;
const PDF_EOF_SCAN_BYTES = 2_048;
const UNSAFE_PDF_DICTIONARY_KEYS = new Set([
  "AA",
  "OpenAction",
  "JavaScript",
  "JS",
  "EmbeddedFile",
  "EmbeddedFiles",
  "RichMedia",
  "RichMediaSettings",
  "SubmitForm",
  "ImportData",
]);
const UNSAFE_PDF_ACTION_NAMES = new Set([
  "JavaScript",
  "Launch",
  "EmbeddedFile",
  "RichMedia",
  "SubmitForm",
  "ImportData",
  "GoToR",
  "GoToE",
]);

export type PreparedApplicationDocument = {
  bytes: Uint8Array;
  extension: "jpg" | "pdf" | "png";
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
};

function cleanDisplayName(name: string): string {
  return (
    name
      .normalize("NFKC")
      // Control and bidirectional override characters can make a dangerous
      // extension appear reversed in admin review screens.
      .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "")
      .replace(/[\\/]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160) || "document"
  );
}

export function safeDocumentDisplayName(
  name: string,
  canonicalExtension?: PreparedApplicationDocument["extension"]
): string {
  const cleaned = cleanDisplayName(name);
  if (!canonicalExtension) return cleaned;
  const withoutLastExtension = cleaned.replace(/\.[^.]*$/, "");
  const base = withoutLastExtension.replace(/\.+/g, "-").replace(/-+$/g, "").slice(0, 140) || "document";
  return `${base}.${canonicalExtension}`;
}

function hasCanonicalPdfEnvelope(bytes: Uint8Array): boolean {
  if (bytes.length < 8 || new TextDecoder("latin1").decode(bytes.slice(0, 5)) !== "%PDF-") return false;
  const tailStart = Math.max(0, bytes.length - PDF_EOF_SCAN_BYTES);
  return new TextDecoder("latin1").decode(bytes.slice(tailStart)).includes("%%EOF");
}

function normalizedPdfName(name: PDFName): string {
  return name.asString().replace(/^\//, "");
}

function containsUnsafePdfFeatures(document: PDFDocument): boolean {
  // Inspect parsed objects rather than raw bytes so compressed object streams
  // cannot hide an active action from the validation boundary.
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    const dictionary = object instanceof PDFStream ? object.dict : object instanceof PDFDict ? object : null;
    if (!dictionary) continue;

    for (const [key, rawValue] of dictionary.entries()) {
      if (UNSAFE_PDF_DICTIONARY_KEYS.has(normalizedPdfName(key))) return true;
      const value = document.context.lookup(rawValue);
      if (value instanceof PDFName && UNSAFE_PDF_ACTION_NAMES.has(normalizedPdfName(value))) return true;
    }
  }
  return false;
}

async function rebuildPdf(
  file: File,
  maxBytes: number
): Promise<UploadPreparationResult<PreparedApplicationDocument>> {
  const input = new Uint8Array(await file.arrayBuffer());
  if (!hasCanonicalPdfEnvelope(input)) {
    return { ok: false, error: "The file is not a complete PDF document" };
  }

  try {
    const source = await PDFDocument.load(input, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    if (source.isEncrypted) return { ok: false, error: "Encrypted PDF documents are not supported" };
    if (containsUnsafePdfFeatures(source)) {
      return { ok: false, error: "Interactive PDF actions and embedded content are not supported" };
    }
    const pageCount = source.getPageCount();
    if (!pageCount || pageCount > MAX_PDF_PAGES) {
      return { ok: false, error: `PDF documents must contain between 1 and ${MAX_PDF_PAGES} pages` };
    }

    // Copy only static page content into a brand-new document. Document-level
    // JavaScript, OpenAction/AA actions, embedded files, forms and name trees
    // are not copied. Page annotations are explicitly removed as they can hold
    // Launch, URI, JavaScript and file-attachment actions.
    const safe = await PDFDocument.create();
    const pages = await safe.copyPages(source, Array.from({ length: pageCount }, (_, index) => index));
    for (const page of pages) {
      page.node.delete(PDFName.of("Annots"));
      page.node.delete(PDFName.of("AA"));
      safe.addPage(page);
    }
    safe.setCreator("Mahaly secure document processor");
    safe.setProducer("Mahaly secure document processor");
    const output = await safe.save({ addDefaultPage: false, useObjectStreams: true });
    if (!output.length || output.length > maxBytes) {
      return { ok: false, error: "The sanitized PDF is larger than allowed" };
    }
    return {
      ok: true,
      upload: { bytes: Uint8Array.from(output), extension: "pdf", mimeType: "application/pdf" },
    };
  } catch {
    return { ok: false, error: "The PDF is corrupt, encrypted, or cannot be processed safely" };
  }
}

export async function prepareSafeApplicationDocument(
  file: File,
  maxBytes: number
): Promise<UploadPreparationResult<PreparedApplicationDocument>> {
  if (!file.size) return { ok: false, error: "The document is empty" };
  if (file.size > maxBytes) return { ok: false, error: "The document is larger than allowed" };
  if (file.type === "application/pdf") return rebuildPdf(file, maxBytes);
  if (file.type !== "image/jpeg" && file.type !== "image/png") {
    return { ok: false, error: "Only PDF, JPEG, and PNG documents are supported" };
  }

  const image = await prepareSafeImageUpload(file, {
    allowedMimeTypes: ["image/jpeg", "image/png"],
    maxBytes,
    maxDimension: 6_000,
  });
  if (!image.ok) return image;
  const upload: PreparedImageUpload = image.upload;
  return {
    ok: true,
    upload: {
      bytes: upload.bytes,
      extension: upload.extension as "jpg" | "png",
      mimeType: upload.mimeType as "image/jpeg" | "image/png",
    },
  };
}
