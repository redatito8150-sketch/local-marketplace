"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

export interface SelectableOptionValue {
  id: string;
  label: string;
}

// Searchable multi-select matching the governorate selector's interaction
// quality (components/join/ApplyBrandForm.tsx's SearchableMultiSelect):
// type-to-filter, click/keyboard-toggle buttons, stable option ordering.
// Adds a visible "selected chips" row (each removable) and an inline
// "+ Create" affordance for a brand's own private custom values — neither
// of which the governorate selector needed, both of which this task asks
// for explicitly.
export default function OptionValueMultiSelect({
  label,
  options,
  selectedIds,
  onToggle,
  onCreate,
  createLabel = "Create custom value",
  disabled,
}: {
  label: string;
  options: SelectableOptionValue[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onCreate?: (label: string) => Promise<void> | void;
  createLabel?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => selectedIds.map((id) => options.find((o) => o.id === id)).filter((o): o is SelectableOptionValue => Boolean(o)),
    [options, selectedIds]
  );

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const handleCreate = async () => {
    if (!newLabel.trim() || !onCreate) return;
    setBusy(true);
    try {
      await onCreate(newLabel.trim());
      setNewLabel("");
      setCreating(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}</span>

      {selected.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {selected.map((option) => (
            <span
              key={option.id}
              className="flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-[12px] font-medium text-cream"
            >
              {option.label}
              <button
                type="button"
                onClick={() => onToggle(option.id)}
                aria-label={`Remove ${option.label}`}
                className="rounded-full hover:bg-white/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="text"
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${label.toLowerCase()}…`}
        aria-label={`Search ${label}`}
        className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30 disabled:cursor-not-allowed disabled:bg-stone-50"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {filtered.map((option) => {
          const active = selectedIds.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(option.id)}
              aria-pressed={active}
              className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                active ? "border-ink bg-ink text-cream" : "border-stone-200 text-ink-soft/70 hover:border-ink/40"
              }`}
            >
              {option.label}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <span className="text-[12.5px] text-ink-soft/50">No matches</span>
        )}
      </div>

      {onCreate && !disabled && (
        <div className="mt-2">
          {creating ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                autoFocus
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="New value name"
                className="w-48 rounded-md border border-stone-150 bg-white px-3 py-1.5 text-[13px] text-ink outline-none focus:border-ink/30"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={busy || !newLabel.trim()}
                className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-semibold text-cream disabled:opacity-50"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => { setCreating(false); setNewLabel(""); }}
                className="text-[12px] text-ink-soft/60 hover:underline"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-ink hover:underline"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              {createLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
