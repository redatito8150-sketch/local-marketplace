import sharp from "sharp";

const PRODUCT_FOLDER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_MAX_INPUT_PIXELS = 40_000_000;
const DEFAULT_MAX_DIMENSION = 6_000;

export type SafeImageMimeType = "image/jpeg" | "image/png" | "image/webp" | "image/avif";

export type PreparedImageUpload = {
  bytes: Uint8Array;
  extension: "jpg" | "png" | "webp" | "avif";
  height: number;
  mimeType: SafeImageMimeType;
  width: number;
};

export type UploadPreparationResult<T> =
  | { ok: true; upload: T }
  | { error: string; ok: false };

type PrepareImageOptions = {
  allowedMimeTypes: readonly SafeImageMimeType[];
  maxBytes: number;
  maxDimension?: number;
  maxInputPixels?: number;
};

const EXTENSION_BY_MIME: Record<SafeImageMimeType, PreparedImageUpload["extension"]> = {
  "image/avif": "avif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isCanonicalProductFolderId(value: string): boolean {
  return PRODUCT_FOLDER_PATTERN.test(value);
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isSafeImageMimeType(value: string): value is SafeImageMimeType {
  return value in EXTENSION_BY_MIME;
}

export async function hasExpectedImageSignature(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (file.type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (file.type === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (byte, index) => bytes[index] === byte
    );
  }
  if (file.type === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  if (file.type === "image/avif") {
    const box = String.fromCharCode(...bytes.slice(4, 12));
    return box.startsWith("ftyp") && ["avif", "avis"].includes(box.slice(4, 8));
  }
  return false;
}

function formatMatchesMime(format: string | undefined, mimeType: SafeImageMimeType): boolean {
  if (mimeType === "image/jpeg") return format === "jpeg";
  if (mimeType === "image/png") return format === "png";
  if (mimeType === "image/webp") return format === "webp";
  // libvips exposes AVIF through its HEIF decoder. The AVIF-specific ftyp
  // signature was already verified above, so HEIC renamed to AVIF cannot pass.
  return format === "heif";
}

/**
 * Fully decodes and re-encodes an untrusted image before storage.
 *
 * Signature-only checks reject obvious MIME spoofing but still accept image
 * polyglots with executable data appended after valid pixels. Re-encoding is
 * the security boundary: it strips original metadata, trailing bytes and
 * container-level payloads while the pixel/dimension limits constrain image
 * decompression attacks.
 */
export async function prepareSafeImageUpload(
  file: File,
  options: PrepareImageOptions
): Promise<UploadPreparationResult<PreparedImageUpload>> {
  if (!file.size) return { ok: false, error: "The image is empty" };
  if (file.size > options.maxBytes) return { ok: false, error: "The image is larger than allowed" };
  if (!isSafeImageMimeType(file.type) || !options.allowedMimeTypes.includes(file.type)) {
    return { ok: false, error: "Unsupported image type" };
  }
  if (!(await hasExpectedImageSignature(file))) {
    return { ok: false, error: "The file content does not match its image type" };
  }

  try {
    const input = Buffer.from(await file.arrayBuffer());
    const decoder = sharp(input, {
      failOn: "warning",
      limitInputChannels: 4,
      limitInputPixels: options.maxInputPixels ?? DEFAULT_MAX_INPUT_PIXELS,
      sequentialRead: true,
    });
    const metadata = await decoder.metadata();
    if (!metadata.width || !metadata.height || !formatMatchesMime(metadata.format, file.type)) {
      return { ok: false, error: "The file is not a valid supported image" };
    }
    if ((metadata.pages ?? 1) !== 1) {
      return { ok: false, error: "Animated or multi-page images are not supported" };
    }

    const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
    let pipeline = decoder
      .autoOrient()
      .resize({
        fit: "inside",
        height: maxDimension,
        width: maxDimension,
        withoutEnlargement: true,
      });

    if (file.type === "image/jpeg") {
      pipeline = pipeline.jpeg({ progressive: true, quality: 90 });
    } else if (file.type === "image/png") {
      pipeline = pipeline.png({ compressionLevel: 9 });
    } else if (file.type === "image/webp") {
      pipeline = pipeline.webp({ effort: 4, quality: 90 });
    } else {
      pipeline = pipeline.avif({ effort: 4, quality: 60 });
    }

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    if (!data.length || data.length > options.maxBytes) {
      return { ok: false, error: "The normalized image is larger than allowed" };
    }

    return {
      ok: true,
      upload: {
        bytes: Uint8Array.from(data),
        extension: EXTENSION_BY_MIME[file.type],
        height: info.height,
        mimeType: file.type,
        width: info.width,
      },
    };
  } catch {
    return { ok: false, error: "The image is corrupt or cannot be decoded safely" };
  }
}

// Kept as a cheap compatibility helper for callers/tests that only need to
// identify the outer document container. Brand Application uploads use the
// stronger full parsing and rebuilding boundary in applicationDocument.ts.
export async function hasExpectedDocumentSignature(file: File): Promise<boolean> {
  if (file.type === "application/pdf") {
    const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    return String.fromCharCode(...bytes) === "%PDF-";
  }
  return hasExpectedImageSignature(file);
}
