"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";

const AUTO_ADVANCE_MS = 10000;
const MAX_IMAGES = 6;

// One or more cover photos per collection, auto-advancing every ~10s when
// there's more than one — any viewer can also override manually (arrows or
// dots), which just resets the auto-advance timer rather than fighting it.
// In `editable` mode (owner/admin, on the Collections page's own
// management panel) it also handles adding/removing photos itself via
// app/api/brands/[slug]/collections/[id]/cover-image.
export default function CollectionCoverCarousel({
  images,
  alt,
  sizes,
  priority = false,
  fillClassName = "",
  editable = false,
  brandSlug,
  collectionId,
  onImagesChange,
}: {
  images: string[];
  alt: string;
  sizes?: string;
  priority?: boolean;
  fillClassName?: string;
  editable?: boolean;
  brandSlug?: string;
  collectionId?: string;
  onImagesChange?: (next: string[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived rather than clamped via a state-writing effect — if `images`
  // shrinks (a photo removed) so `index` no longer points anywhere real,
  // this just safely falls back to the first slide for this render instead
  // of needing to correct `index` itself.
  const safeIndex = images.length === 0 ? 0 : index % images.length;

  useEffect(() => {
    if (images.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % images.length);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
    // Restarts the countdown from a full 10s whenever the shopper manually
    // jumps to a slide too, so it doesn't advance again a moment later.
  }, [images.length, safeIndex]);

  const goTo = (next: number) => {
    if (images.length === 0) return;
    setIndex(((next % images.length) + images.length) % images.length);
  };

  const handleAdd = async (file: File) => {
    if (!brandSlug || !collectionId) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/brands/${brandSlug}/collections/${collectionId}/cover-image`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }
      onImagesChange?.(data.coverImageUrls);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!brandSlug || !collectionId) return;
    setRemoving(true);
    setError("");
    try {
      const res = await fetch(`/api/brands/${brandSlug}/collections/${collectionId}/cover-image?index=${safeIndex}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Remove failed");
        return;
      }
      onImagesChange?.(data.coverImageUrls);
    } catch {
      setError("Remove failed. Please try again.");
    } finally {
      setRemoving(false);
    }
  };

  // No hardcoded position utility on this wrapper on purpose —
  // `fillClassName` always supplies its own ("absolute inset-0" for the
  // public experience, "relative h-32 ..." for the management panel), and
  // Tailwind only ever applies ONE of two conflicting `position` utilities
  // on the same element (whichever wins the cascade order, not the one
  // listed last in the class string) — hardcoding "relative" here silently
  // broke every "absolute inset-0" caller, which is exactly why an
  // uploaded cover photo showed correctly in the management thumbnail
  // (its own "relative h-32" never conflicted) but never on the actual
  // public card.
  return (
    <div className={`group/carousel overflow-hidden ${fillClassName}`}>
      {images.length > 0 ? (
        <Image src={images[safeIndex]} alt={alt} fill priority={priority} sizes={sizes} className="object-cover" />
      ) : (
        <div className="absolute inset-0 bg-[#e9dfd2]" />
      )}

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => goTo(safeIndex - 1)}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white opacity-0 transition group-hover/carousel:opacity-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => goTo(safeIndex + 1)}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white opacity-0 transition group-hover/carousel:opacity-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {images.map((_, dotIndex) => (
              <button
                key={dotIndex}
                type="button"
                onClick={() => goTo(dotIndex)}
                aria-label={`Show photo ${dotIndex + 1}`}
                className={`h-1.5 rounded-full transition-all ${dotIndex === safeIndex ? "w-5 bg-white" : "w-1.5 bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}

      {editable && (
        <div className="absolute right-2 top-2 flex gap-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || images.length >= MAX_IMAGES}
            aria-label="Add cover photo"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-[#3a2826] shadow-sm disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
          {images.length > 0 && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing}
              aria-label="Remove this photo"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-red-600 shadow-sm disabled:opacity-50"
            >
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleAdd(file);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {error && (
        <span className="absolute bottom-2 left-2 rounded-md bg-red-600 px-2 py-1 text-[11px] text-white">{error}</span>
      )}
    </div>
  );
}
