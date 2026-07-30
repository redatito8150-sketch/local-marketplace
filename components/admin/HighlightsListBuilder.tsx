"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";

// Product Highlights — an ordered list of short bullet points (replaces
// the old "Details (one per line)" textarea). Empty rows are never saved:
// callers should trim/filter on submit, but this component also drops a
// row the moment it's both blurred and empty, so a half-typed row never
// silently lingers in the middle of the list.
export default function HighlightsListBuilder({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");

  const addHighlight = () => {
    if (!draft.trim()) return;
    onChange([...value, draft.trim()]);
    setDraft("");
  };

  const updateAt = (index: number, text: string) => {
    onChange(value.map((v, i) => (i === index ? text : v)));
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div>
      <span className="text-[12.5px] font-medium text-ink-soft/70">Product Highlights</span>
      <div className="mt-1.5 space-y-2">
        {value.map((highlight, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={disabled || i === 0}
                aria-label="Move highlight up"
                className="text-ink-soft/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={disabled || i === value.length - 1}
                aria-label="Move highlight down"
                className="text-ink-soft/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
            <input
              type="text"
              value={highlight}
              disabled={disabled}
              onChange={(e) => updateAt(i, e.target.value)}
              onBlur={() => { if (!value[i]?.trim()) removeAt(i); }}
              aria-label={`Highlight ${i + 1}`}
              className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30 disabled:bg-stone-50"
            />
            <button
              type="button"
              onClick={() => removeAt(i)}
              disabled={disabled}
              aria-label="Remove highlight"
              className="rounded p-1.5 text-ink-soft/40 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <input
          type="text"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addHighlight();
            }
          }}
          placeholder="e.g. Breathable fabric"
          aria-label="New highlight"
          className="w-full max-w-xs rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30 disabled:bg-stone-50"
        />
        <button
          type="button"
          onClick={addHighlight}
          disabled={disabled || !draft.trim()}
          className="flex items-center gap-1 rounded-md border border-stone-200 px-3 py-2 text-[12.5px] font-semibold text-ink hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          Add Highlight
        </button>
      </div>
    </div>
  );
}
