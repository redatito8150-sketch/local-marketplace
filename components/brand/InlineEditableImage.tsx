"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useBrandEdit } from "./BrandEditContext";

interface InlineEditableImageProps {
  field: "hero" | "logo" | "about";
  src: string | undefined;
  alt: string;
  fill?: boolean;
  sizes?: string;
  priority?: boolean;
  imgClassName?: string;
  // Renders on top of the existing image, absolutely positioned — the
  // parent element is always already `relative overflow-hidden` at every
  // call site (cover/logo/about frames), so this never needs its own
  // wrapper div and never disturbs the surrounding layout.
  overlaySizeClassName?: string;
  // Shown instead of the <Image> when there's no current image at all
  // (e.g. a brand with no logo yet) — an editor still gets the upload
  // overlay on top of it; a non-editor just sees the fallback as-is.
  emptyPlaceholder?: React.ReactNode;
  // Whether this field currently has a "last deleted" backup on the server
  // (brands.deleted_image_backups — see app/api/brands/[slug]/image) —
  // read on the initial page load so the undo button survives a refresh,
  // not just the same client session that did the deleting.
  hasBackup?: boolean;
}

// Facebook-style "hover the photo, see a camera icon, click to replace it"
// for the brand's cover/logo/about images. Falls back to a plain <Image>
// (no overlay at all) for every non-editor viewer.
export default function InlineEditableImage({
  field,
  src,
  alt,
  fill,
  sizes,
  priority,
  imgClassName,
  overlaySizeClassName = "inset-0",
  emptyPlaceholder,
  hasBackup = false,
}: InlineEditableImageProps) {
  const { canEdit, brandSlug } = useBrandEdit();
  const [current, setCurrent] = useState(src);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backupAvailable, setBackupAvailable] = useState(hasBackup);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRemove = async () => {
    setRemoving(true);
    setError("");
    try {
      const res = await fetch(`/api/brands/${brandSlug}/image?field=${field}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Remove failed");
        return;
      }
      setCurrent(undefined);
      setBackupAvailable(Boolean(data.canRestore));
    } catch {
      setError("Remove failed. Please try again.");
    } finally {
      setRemoving(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    setError("");
    try {
      const res = await fetch(`/api/brands/${brandSlug}/image/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Restore failed");
        return;
      }
      setCurrent(data.url);
      setBackupAvailable(false);
    } catch {
      setError("Restore failed. Please try again.");
    } finally {
      setRestoring(false);
    }
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("field", field);
      const res = await fetch(`/api/brands/${brandSlug}/image`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }
      setCurrent(data.url);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  if (!current && !canEdit) return null;

  return (
    <>
      {current ? (
        <Image src={current} alt={alt} fill={fill} sizes={sizes} priority={priority} className={imgClassName} />
      ) : (
        emptyPlaceholder
      )}
      {canEdit && (
        <div className={`absolute z-20 ${overlaySizeClassName} flex items-center justify-center gap-3 bg-black/0 transition-colors hover:bg-black/35 group`}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || removing}
            aria-label={`Change ${field} image`}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-soft transition-opacity group-hover:opacity-100 disabled:opacity-100"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-ink" strokeWidth={2} />
            ) : (
              <Camera className="h-4 w-4 text-ink" strokeWidth={1.8} />
            )}
          </button>
          {current ? (
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading || removing}
              aria-label={`Remove ${field} image`}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-soft transition-opacity group-hover:opacity-100 disabled:opacity-100"
            >
              {removing ? (
                <Loader2 className="h-4 w-4 animate-spin text-red-600" strokeWidth={2} />
              ) : (
                <Trash2 className="h-4 w-4 text-red-600" strokeWidth={1.8} />
              )}
            </button>
          ) : (
            backupAvailable && (
              <button
                type="button"
                onClick={handleRestore}
                disabled={uploading || restoring}
                aria-label={`Undo delete of ${field} image`}
                title="Restore the last deleted image"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-soft transition-opacity group-hover:opacity-100 disabled:opacity-100"
              >
                {restoring ? (
                  <Loader2 className="h-4 w-4 animate-spin text-ink" strokeWidth={2} />
                ) : (
                  <RotateCcw className="h-4 w-4 text-ink" strokeWidth={1.8} />
                )}
              </button>
            )
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          {error && (
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-red-600 px-2 py-1 text-[11px] text-white">
              {error}
            </span>
          )}
        </div>
      )}
    </>
  );
}
