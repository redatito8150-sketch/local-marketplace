"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FeaturedBrandAndSponsoredContent } from "@/types";

export default function FeaturedSponsoredForm({
  initial,
  brandOptions,
}: {
  initial: FeaturedBrandAndSponsoredContent;
  brandOptions: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const [featuredBrandSlug, setFeaturedBrandSlug] = useState(initial.featuredBrandSlug);
  const [sponsoredBrandSlugs, setSponsoredBrandSlugs] = useState<string[]>(
    initial.sponsoredBrandSlugs
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const toggleSponsored = (slug: string) =>
    setSponsoredBrandSlugs((slugs) =>
      slugs.includes(slug) ? slugs.filter((s) => s !== slug) : [...slugs, slug]
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/admin/site-content/featured_brand_and_sponsored", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: { featuredBrandSlug, sponsoredBrandSlugs } }),
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
    <form onSubmit={handleSubmit} className="max-w-lg space-y-6">
      <div>
        <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
          Featured brand <span className="text-red-600">*</span>
        </label>
        <select
          value={featuredBrandSlug}
          onChange={(e) => setFeaturedBrandSlug(e.target.value)}
          className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
        >
          {brandOptions.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.name}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-[12px] text-ink-soft/50">
          Shows this brand&apos;s name, story, and a link to their real brand page.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
          Sponsored brands
        </label>
        <div className="space-y-2 rounded-md border border-stone-150 bg-white p-3">
          {brandOptions.map((b) => (
            <label key={b.slug} className="flex items-center gap-2 text-[13.5px] text-ink">
              <input
                type="checkbox"
                checked={sponsoredBrandSlugs.includes(b.slug)}
                onChange={() => toggleSponsored(b.slug)}
              />
              {b.name}
            </label>
          ))}
        </div>
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
