"use client";

import { useRef, useState } from "react";
import NextImage from "next/image";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Plus, Trash2, Upload } from "lucide-react";
import ColorSwatch from "./ColorSwatch";
import { storagePathFromPublicUrl } from "./ImageUploader";
import type { OptionSwatchType } from "@/types";
import { assessProductImageDimensions, PRODUCT_IMAGE_MAX_BYTES, type ProductImageQuality } from "@/lib/admin/productImageQuality";

const GALLERY_CAP = 3;

async function inspectProductImage(file: File): Promise<ProductImageQuality> {
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) throw new Error("Image is larger than 5MB.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("We could not read this image."));
      image.src = objectUrl;
    });
    const quality = assessProductImageDimensions(dimensions.width, dimensions.height);
    if (quality.level === "error") throw new Error(`${quality.label}. ${quality.detail}`);
    return quality;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export interface MediaGalleryColor {
  id: string;
  label: string;
  swatchType?: OptionSwatchType;
  primaryColor?: string;
  secondaryColor?: string;
}

async function uploadOne(file: File, folderId: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folderId", folderId);
  const res = await fetch("/api/admin/products/images", { method: "POST", body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Upload failed");
  return data.url as string;
}

async function deleteOne(url: string) {
  const path = storagePathFromPublicUrl(url);
  if (!path) return;
  try {
    await fetch("/api/admin/products/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
  } catch {
    // Already gone from the form; a failed storage cleanup isn't worth
    // blocking or re-surfacing to the admin over.
  }
}

// One place for every product image (Cover, per-Color, and general
// Gallery) with a single ordered list — `images` — spanning both Gallery
// and Color images, so the merchant can freely drag any of them into any
// position relative to each other. Cover always stays first and is not
// part of this reorderable list, matching the "cover always leads the
// gallery" rule everywhere else in the app.
export default function MediaGallery({
  folderId,
  coverUrl,
  onCoverChange,
  images,
  onImagesChange,
  colorImages,
  onColorImagesChange,
  colors,
  disabled,
}: {
  folderId: string;
  coverUrl: string;
  onCoverChange: (url: string) => void;
  images: string[];
  onImagesChange: (urls: string[]) => void;
  colorImages: Record<string, string>;
  onColorImagesChange: (next: Record<string, string>) => void;
  colors: MediaGalleryColor[];
  disabled?: boolean;
}) {
  // Which single box is currently uploading — "cover", "gallery", or
  // `color:${colorId}` — not a shared boolean, so uploading one image
  // doesn't flip every other box's spinner/disabled state on too.
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [qualityByUrl, setQualityByUrl] = useState<Record<string, ProductImageQuality>>({});
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const colorInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const colorByUrl = new Map(Object.entries(colorImages).map(([id, url]) => [url, id]));
  const colorById = new Map(colors.map((c) => [c.id, c]));
  const galleryCount = images.filter((url) => !colorByUrl.has(url)).length;
  const missingColors = colors.filter((c) => !colorImages[c.id]);

  const handleCoverUpload = async (files: FileList | File[]) => {
    const file = Array.from(files)[0];
    if (!file) return;
    setUploadingSlot("cover");
    setError("");
    try {
      const quality = await inspectProductImage(file);
      const url = await uploadOne(file, folderId);
      if (coverUrl) {
        await deleteOne(coverUrl);
        setQualityByUrl((current) => { const next = { ...current }; delete next[coverUrl]; return next; });
      }
      onCoverChange(url);
      setQualityByUrl((current) => ({ ...current, [url]: quality }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingSlot(null);
    }
  };

  const removeCover = async () => {
    if (!coverUrl) return;
    const url = coverUrl;
    onCoverChange("");
    setQualityByUrl((current) => { const next = { ...current }; delete next[url]; return next; });
    await deleteOne(url);
  };

  const handleGalleryUpload = async (files: FileList | File[]) => {
    const remaining = Math.max(0, GALLERY_CAP - galleryCount);
    const list = Array.from(files).slice(0, remaining);
    if (list.length === 0) return;
    setUploadingSlot("gallery");
    setError("");
    try {
      const uploaded: string[] = [];
      const inspected: ProductImageQuality[] = [];
      for (const file of list) {
        inspected.push(await inspectProductImage(file));
        uploaded.push(await uploadOne(file, folderId));
      }
      onImagesChange([...images, ...uploaded]);
      setQualityByUrl((current) => ({ ...current, ...Object.fromEntries(uploaded.map((url, index) => [url, inspected[index]])) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleColorUpload = async (colorId: string, files: FileList | File[]) => {
    const file = Array.from(files)[0];
    if (!file) return;
    setUploadingSlot(`color:${colorId}`);
    setError("");
    try {
      const quality = await inspectProductImage(file);
      // Was hardcoded to the literal string "color-images" — never a real
      // product id, so the server's ownership check (isUuid(folderId) /
      // the product actually existing) always rejected it with "Not
      // authorized for this product" for a brand owner. Color images need
      // the same real folderId cover/gallery uploads already use.
      const url = await uploadOne(file, folderId);
      const existing = colorImages[colorId];
      if (existing) {
        await deleteOne(existing);
        onImagesChange(images.map((u) => (u === existing ? url : u)));
        setQualityByUrl((current) => { const next = { ...current }; delete next[existing]; return next; });
      } else {
        onImagesChange([...images, url]);
      }
      onColorImagesChange({ ...colorImages, [colorId]: url });
      setQualityByUrl((current) => ({ ...current, [url]: quality }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingSlot(null);
    }
  };

  const removeAt = async (index: number) => {
    const url = images[index];
    const colorId = colorByUrl.get(url);
    onImagesChange(images.filter((_, i) => i !== index));
    if (colorId) {
      const next = { ...colorImages };
      delete next[colorId];
      onColorImagesChange(next);
    }
    setQualityByUrl((current) => { const next = { ...current }; delete next[url]; return next; });
    await deleteOne(url);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onImagesChange(next);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {/* Cover — fixed first, not part of the reorderable list */}
        <div className="w-28">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft/50">Cover *</span>
          <div className="group relative mt-1 h-24 w-24 overflow-hidden rounded-lg border border-stone-150 bg-stone-50">
            {coverUrl ? (
              <>
                <NextImage src={coverUrl} alt="Product cover preview" fill sizes="96px" className="object-cover" />
                <ImageQualityBadge quality={qualityByUrl[coverUrl]} />
                <button
                  type="button"
                  onClick={removeCover}
                  aria-label="Remove cover image"
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={disabled || uploadingSlot === "cover"}
                onClick={() => coverInputRef.current?.click()}
                className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-soft/50 hover:text-ink"
              >
                {uploadingSlot === "cover" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" strokeWidth={1.8} />}
                <span className="text-[10px]">{uploadingSlot === "cover" ? "Uploading…" : "Upload"}</span>
              </button>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleCoverUpload(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {/* Unified, freely reorderable list: Gallery + Color images together */}
        {images.map((url, i) => {
          const colorId = colorByUrl.get(url);
          const color = colorId ? colorById.get(colorId) : undefined;
          return (
            <div key={url} className="w-28">
              <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft/50">
                {color ? (
                  <>
                    <ColorSwatch swatchType={color.swatchType} primaryColor={color.primaryColor} secondaryColor={color.secondaryColor} size={11} />
                    {color.label}
                  </>
                ) : (
                  "Gallery"
                )}
              </span>
              <div className="group relative mt-1 h-24 w-24 overflow-hidden rounded-lg border border-stone-150 bg-stone-50">
                <NextImage src={url} alt={color ? `${color.label} product preview` : "Product gallery preview"} fill sizes="96px" className="object-cover" />
                <ImageQualityBadge quality={qualityByUrl[url]} />
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  aria-label="Remove image"
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
                <div className="absolute bottom-1 left-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move earlier"
                    className="flex h-5 w-5 items-center justify-center rounded bg-black/60 text-white disabled:opacity-30"
                  >
                    <ChevronLeft className="h-3 w-3" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === images.length - 1}
                    aria-label="Move later"
                    className="flex h-5 w-5 items-center justify-center rounded bg-black/60 text-white disabled:opacity-30"
                  >
                    <ChevronRight className="h-3 w-3" strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Add to Gallery (only while under the 3-image gallery cap) */}
        {galleryCount < GALLERY_CAP && (
          <div className="w-28">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft/50">Gallery</span>
            <button
              type="button"
              disabled={disabled || uploadingSlot === "gallery"}
              onClick={() => galleryInputRef.current?.click()}
              className="mt-1 flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-stone-200 text-ink-soft/50 hover:border-ink/40 hover:text-ink"
            >
              {uploadingSlot === "gallery" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={1.8} />}
              <span className="text-[10px]">Add ({GALLERY_CAP - galleryCount} left)</span>
            </button>
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleGalleryUpload(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {/* One dedicated upload tile per color still missing its image */}
        {missingColors.map((color) => (
          <div key={color.id} className="w-28">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft/50">
              <ColorSwatch swatchType={color.swatchType} primaryColor={color.primaryColor} secondaryColor={color.secondaryColor} size={11} />
              {color.label} *
            </span>
            <button
              type="button"
              disabled={disabled || uploadingSlot === `color:${color.id}`}
              onClick={() => colorInputRefs.current[color.id]?.click()}
              className="mt-1 flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/40 text-amber-700 hover:border-amber-400"
            >
              {uploadingSlot === `color:${color.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" strokeWidth={1.8} />}
              <span className="text-[10px]">Upload</span>
            </button>
            <input
              ref={(el) => { colorInputRefs.current[color.id] = el; }}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleColorUpload(color.id, e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg bg-[#f7f2ed] px-3 py-2.5 text-[10.5px] text-[#7f7167]">
        <span className="font-bold text-[#544941]">Image guide</span>
        <span>Best: 1200 × 1500px (4:5)</span>
        <span>Minimum: 600 × 750px</span>
        <span>Maximum: 5MB</span>
      </div>
      {Object.entries(qualityByUrl).some(([, quality]) => quality.level === "warning") ? <div className="mt-2 space-y-1">{Object.entries(qualityByUrl).filter(([, quality]) => quality.level === "warning").map(([url, quality]) => <p key={url} className="flex items-center gap-1.5 text-[10.5px] font-medium text-amber-700"><AlertTriangle className="h-3 w-3 shrink-0" />{quality.width} × {quality.height}px — {quality.detail}</p>)}</div> : null}
      {error && <p className="mt-2 text-[12px] font-medium text-red-600">{error}</p>}
    </div>
  );
}

function ImageQualityBadge({ quality }: { quality?: ProductImageQuality }) {
  if (!quality) return null;
  return <span title={`${quality.width} × ${quality.height}px — ${quality.detail}`} className={`absolute bottom-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/70 shadow-sm ${quality.level === "good" ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"}`}>{quality.level === "good" ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}</span>;
}
