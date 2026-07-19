"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { JournalArticle } from "@/content/journal";

interface JournalArticleFormProps {
  mode: "create" | "edit";
  initial?: JournalArticle;
}

function toBodyText(body?: string[]): string {
  return (body ?? [""]).join("\n\n");
}

export default function JournalArticleForm({ mode, initial }: JournalArticleFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [image, setImage] = useState(initial?.image ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [bodyText, setBodyText] = useState(toBodyText(initial?.body));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const payload = {
      title: title.trim(),
      excerpt: excerpt.trim(),
      image: image.trim(),
      category: category.trim(),
      body: bodyText
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean),
    };

    try {
      const res = await fetch(
        mode === "create"
          ? "/api/admin/site-content/journal"
          : `/api/admin/site-content/journal/${initial!.slug}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.push("/admin/content/journal");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
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
          Excerpt <span className="text-red-600">*</span>
        </label>
        <textarea
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
            Category <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Makers, Craft, Edits…"
            className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
          />
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
      </div>

      <div>
        <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
          Article body <span className="text-red-600">*</span>
        </label>
        <p className="mb-1.5 text-[11.5px] text-ink-soft/50">
          Separate paragraphs with a blank line.
        </p>
        <textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          rows={10}
          className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
        />
      </div>

      {error && <p className="text-[13px] text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-ink px-5 py-2.5 text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02] disabled:opacity-60"
      >
        {submitting ? "Saving…" : mode === "create" ? "Publish article" : "Save changes"}
      </button>
    </form>
  );
}
