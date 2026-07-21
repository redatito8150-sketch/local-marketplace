"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { HeroTileContent, HomeHeroTilesContent } from "@/types";

export default function HeroTileForm({
  slug,
  label: sectionLabel,
  initial,
}: {
  slug: keyof HomeHeroTilesContent;
  label: string;
  initial: HeroTileContent;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(initial.label);
  const [href, setHref] = useState(initial.href);
  const [image, setImage] = useState(initial.image);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/admin/site-content/home-hero-tiles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          tile: {
            label: label.trim(),
            href: href.trim(),
            image: image.trim(),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4 rounded-xl3 border border-stone-150 bg-white p-5">
      <h2 className="text-[14px] font-semibold text-ink">{sectionLabel}</h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
            Tile label <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
            Link <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
          Image URL <span className="text-red-600">*</span>
        </label>
        <input
          type="text"
          value={image}
          onChange={(e) => setImage(e.target.value)}
          className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
        />
      </div>

      {error && <p className="text-[13px] text-red-600">{error}</p>}
      {saved && !error && <p className="text-[13px] text-green-700">Saved.</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-mahalyred px-5 py-2.5 text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02] disabled:opacity-60"
      >
        {submitting ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
