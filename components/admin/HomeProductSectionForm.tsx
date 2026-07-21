"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { HomeProductSectionContent } from "@/types";

const SOURCE_LABELS: Record<HomeProductSectionContent["source"], string> = {
  new: "New Arrivals",
  trending: "Trending",
  bestsellers: "Best Sellers",
};

export default function HomeProductSectionForm({
  initial,
}: {
  initial: HomeProductSectionContent;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [source, setSource] = useState(initial.source);
  const [limit, setLimit] = useState(initial.limit);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/admin/site-content/home_new_arrivals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: { title: title.trim(), source, limit } }),
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

  const handleReset = async () => {
    if (!confirm("Reset to the original default? This can't be undone.")) return;
    setResetting(true);
    try {
      await fetch("/api/admin/site-content/home_new_arrivals", { method: "DELETE" });
      window.location.reload();
    } finally {
      setResetting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
      <div>
        <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
          Section title <span className="text-red-600">*</span>
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
          Which products
        </label>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as HomeProductSectionContent["source"])}
          className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
        >
          {(Object.keys(SOURCE_LABELS) as HomeProductSectionContent["source"][]).map((key) => (
            <option key={key} value={key}>
              {SOURCE_LABELS[key]}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-[12px] text-ink-soft/50">
          Example: set the title to &quot;Trending&quot; and pick Trending here — the
          homepage heading, products, and &quot;View all&quot; link all switch together.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
          Number of products
        </label>
        <input
          type="number"
          min={1}
          max={24}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="w-32 rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
        />
      </div>

      {error && <p className="text-[13px] text-red-600">{error}</p>}
      {saved && !error && <p className="text-[13px] text-green-700">Saved.</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-mahalyred px-5 py-2.5 text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02] disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className="rounded-md border border-stone-150 px-4 py-2.5 text-[13px] font-semibold text-ink-soft/70 transition-colors hover:bg-stone-100 disabled:opacity-60"
        >
          {resetting ? "Resetting…" : "Reset to default"}
        </button>
      </div>
    </form>
  );
}
