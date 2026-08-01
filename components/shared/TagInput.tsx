"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  error?: string;
  maxTags?: number;
}

// Type anything, press Enter (or comma) and it becomes a chip next to
// whatever's already there — the input clears itself for the next one, and
// existing chips are never touched by that action. Backspace on an empty
// input removes the last chip, matching how recipient/tag inputs elsewhere
// (email clients, etc.) behave.
export default function TagInput({ value, onChange, placeholder, error, maxTags = 10 }: TagInputProps) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const next = draft.trim();
    if (!next) return;
    if (value.length >= maxTags) return;
    if (value.some((tag) => tag.toLowerCase() === next.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, next]);
    setDraft("");
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-ink/15 bg-white px-2.5 py-2 focus-within:border-mahalyred">
        {value.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className="inline-flex items-center gap-1 rounded-full bg-mahalyred/10 px-2.5 py-1 text-[12.5px] font-medium text-mahalyred"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeAt(index)}
              aria-label={`Remove ${tag}`}
              className="rounded-full hover:bg-mahalyred/20"
            >
              <X className="h-3 w-3" strokeWidth={2.5} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && !draft && value.length > 0) {
              removeAt(value.length - 1);
            }
          }}
          onBlur={commit}
          placeholder={value.length >= maxTags ? "" : placeholder}
          disabled={value.length >= maxTags}
          className="min-w-[140px] flex-1 bg-transparent px-1 py-0.5 text-[13.5px] outline-none disabled:hidden"
        />
      </div>
      {error && <p className="mt-1 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
