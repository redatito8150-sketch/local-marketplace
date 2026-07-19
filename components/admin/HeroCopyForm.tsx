"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface HeroCopyValue {
  label?: string;
  headingLines: string[];
  subheading: string;
  ctaLabel: string;
}

export default function HeroCopyForm({
  apiKey,
  initial,
  hasLabel = false,
  maxHeadingLines = 4,
}: {
  apiKey: string;
  initial: HeroCopyValue;
  hasLabel?: boolean;
  maxHeadingLines?: number;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(initial.label ?? "");
  const [headingLines, setHeadingLines] = useState<string[]>(initial.headingLines);
  const [subheading, setSubheading] = useState(initial.subheading);
  const [ctaLabel, setCtaLabel] = useState(initial.ctaLabel);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const updateLine = (i: number, value: string) =>
    setHeadingLines((lines) => lines.map((l, idx) => (idx === i ? value : l)));
  const addLine = () => setHeadingLines((lines) => [...lines, ""]);
  const removeLine = (i: number) =>
    setHeadingLines((lines) => lines.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSaved(false);

    const value = {
      ...(hasLabel ? { label: label.trim() } : {}),
      headingLines: headingLines.map((l) => l.trim()).filter(Boolean),
      subheading: subheading.trim(),
      ctaLabel: ctaLabel.trim(),
    };

    try {
      const res = await fetch(`/api/admin/site-content/${apiKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
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
    if (!confirm("Reset to the original default copy? This can't be undone.")) return;
    setResetting(true);
    try {
      await fetch(`/api/admin/site-content/${apiKey}`, { method: "DELETE" });
      // Full reload (not router.refresh()) so the form's local state is
      // re-seeded from the restored default instead of still showing
      // whatever was in the fields before the reset.
      window.location.reload();
    } finally {
      setResetting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
      {hasLabel && (
        <div>
          <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
            Label <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="JOIN LOCAL"
            className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
          />
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
          Heading lines <span className="text-red-600">*</span>
        </label>
        <div className="space-y-2">
          {headingLines.map((line, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={line}
                onChange={(e) => updateLine(i, e.target.value)}
                className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
              />
              {headingLines.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="rounded-md px-3 text-[12px] text-ink-soft/60 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        {headingLines.length < maxHeadingLines && (
          <button
            type="button"
            onClick={addLine}
            className="mt-2 text-[12.5px] font-semibold text-ink hover:underline"
          >
            + Add line
          </button>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
          Subheading <span className="text-red-600">*</span>
        </label>
        <textarea
          value={subheading}
          onChange={(e) => setSubheading(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
        />
      </div>

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

      {error && <p className="text-[13px] text-red-600">{error}</p>}
      {saved && !error && <p className="text-[13px] text-green-700">Saved.</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-ink px-5 py-2.5 text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02] disabled:opacity-60"
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
