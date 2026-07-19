"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryHeroContent, CategorySlug } from "@/types";

export default function CategoryHeroForm({
  slug,
  label,
  initial,
}: {
  slug: CategorySlug;
  label: string;
  initial: CategoryHeroContent;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [ctaLabel, setCtaLabel] = useState(initial.ctaLabel);
  const [heroImage, setHeroImage] = useState(initial.heroImage);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/admin/site-content/category-heroes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          hero: {
            title: title.trim(),
            description: description.trim(),
            ctaLabel: ctaLabel.trim(),
            heroImage: heroImage.trim(),
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
      <h2 className="text-[14px] font-semibold text-ink">{label}</h2>

      <div>
        <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
          Title <span className="text-red-600">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
          Description <span className="text-red-600">*</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
            Button label <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
            Image URL <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            value={heroImage}
            onChange={(e) => setHeroImage(e.target.value)}
            className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
          />
        </div>
      </div>

      {error && <p className="text-[13px] text-red-600">{error}</p>}
      {saved && !error && <p className="text-[13px] text-green-700">Saved.</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-ink px-5 py-2.5 text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02] disabled:opacity-60"
      >
        {submitting ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
