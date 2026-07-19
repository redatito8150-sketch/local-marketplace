"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Loader2, Trash2, Upload } from "lucide-react";

const BUCKET_PATH_MARKER = "/storage/v1/object/public/product-images/";

function storagePathFromPublicUrl(url: string): string | null {
  const index = url.indexOf(BUCKET_PATH_MARKER);
  if (index === -1) return null;
  return url.slice(index + BUCKET_PATH_MARKER.length);
}

export default function ImageUploader({
  folderId,
  multiple = false,
  value,
  onChange,
  maxImages,
  label,
  hint,
}: {
  folderId: string;
  multiple?: boolean;
  value: string[];
  onChange: (urls: string[]) => void;
  maxImages?: number;
  label: string;
  hint?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const atLimit = typeof maxImages === "number" && value.length >= maxImages;

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).slice(
      0,
      maxImages ? Math.max(0, maxImages - value.length) : undefined
    );
    if (list.length === 0) return;

    setUploading(true);
    setError("");
    try {
      const uploaded: string[] = [];
      for (const file of list) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folderId", folderId);
        const res = await fetch("/api/admin/products/images", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        uploaded.push(data.url);
      }
      onChange(multiple ? [...value, ...uploaded] : uploaded.slice(0, 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const removeAt = async (index: number) => {
    const url = value[index];
    onChange(value.filter((_, i) => i !== index));

    const path = storagePathFromPublicUrl(url);
    if (!path) return;
    try {
      await fetch("/api/admin/products/images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
    } catch {
      // The image is already gone from the form; a failed storage cleanup
      // isn't worth blocking or re-surfacing to the admin over.
    }
  };

  const moveImage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div>
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}</span>

      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-3">
          {value.map((url, i) => (
            <div
              key={url}
              className="group relative h-24 w-24 flex-none overflow-hidden rounded-lg border border-stone-150 bg-stone-50"
            >
              <Image src={url} alt="" fill sizes="96px" className="object-cover" />
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label="Remove image"
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
              </button>
              {multiple && value.length > 1 && (
                <div className="absolute bottom-1 left-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => moveImage(i, -1)}
                    disabled={i === 0}
                    aria-label="Move image earlier"
                    className="flex h-5 w-5 items-center justify-center rounded bg-black/60 text-white disabled:opacity-30"
                  >
                    <ChevronLeft className="h-3 w-3" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveImage(i, 1)}
                    disabled={i === value.length - 1}
                    aria-label="Move image later"
                    className="flex h-5 w-5 items-center justify-center rounded bg-black/60 text-white disabled:opacity-30"
                  >
                    <ChevronRight className="h-3 w-3" strokeWidth={2} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!atLimit && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`mt-2 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
            dragOver ? "border-ink bg-beige-50" : "border-stone-200 hover:border-ink/40"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple={multiple}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-ink-soft/50" strokeWidth={1.8} />
          ) : (
            <Upload className="h-5 w-5 text-ink-soft/50" strokeWidth={1.8} />
          )}
          <span className="text-[13px] font-medium text-ink">
            {uploading ? "Uploading…" : multiple ? "Upload images" : "Upload main image"}
          </span>
          {hint && <span className="text-[11.5px] text-ink-soft/50">{hint}</span>}
        </div>
      )}

      {error && (
        <p className="mt-1.5 text-[12px] font-medium text-red-600">{error}</p>
      )}
    </div>
  );
}
