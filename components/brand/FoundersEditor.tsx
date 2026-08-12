"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { useBrandEdit } from "./BrandEditContext";
import type { BrandFounder } from "@/types";

const MAX_FOUNDERS = 5;

function emptyDraft(): BrandFounder {
  return { name: "", title: "" };
}

// The About page's "who founded this" credits — a list (not a single
// field), each with their own name + title, in whatever order the owner
// arranges them (the array order *is* the display order — reorder via the
// up/down buttons, saved immediately). Saved as one array via the same
// field="founders" branch as every other inline edit on this page
// (app/api/brands/[slug]/inline-edit).
export default function FoundersEditor({ initial }: { initial: BrandFounder[] }) {
  const { canEdit, brandSlug } = useBrandEdit();
  const [founders, setFounders] = useState(initial);
  const [editingIndex, setEditingIndex] = useState<number | null>(null); // -1 = adding new
  const [draft, setDraft] = useState<BrandFounder>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (next: BrandFounder[]) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/brands/${brandSlug}/inline-edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: "founders", value: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return false;
      }
      setFounders(next);
      return true;
    } catch {
      setError("Failed to save. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (index: number) => {
    setDraft(index === -1 ? emptyDraft() : founders[index]);
    setEditingIndex(index);
    setError("");
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setError("");
  };

  const confirmEdit = async () => {
    if (!draft.name.trim()) {
      setError("Name is required");
      return;
    }
    const next = [...founders];
    const cleaned = { name: draft.name.trim(), title: draft.title.trim() || "Founder" };
    if (editingIndex === -1) next.push(cleaned);
    else if (editingIndex !== null) next[editingIndex] = cleaned;
    const ok = await save(next);
    if (ok) setEditingIndex(null);
  };

  const remove = async (index: number) => {
    await save(founders.filter((_, i) => i !== index));
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= founders.length) return;
    const next = [...founders];
    [next[index], next[target]] = [next[target], next[index]];
    await save(next);
  };

  if (!canEdit && founders.length === 0) return null;

  if (!canEdit) {
    return (
      <div className="space-y-1">
        {founders.map((founder, index) => (
          <p key={`${founder.name}-${index}`} className="text-[13px] leading-6 text-[#403833]">
            <span className="font-medium">{founder.name}</span> — {founder.title}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {founders.map((founder, index) =>
        editingIndex === index ? (
          <FounderRowEditor
            key={`${founder.name}-${index}`}
            draft={draft}
            setDraft={setDraft}
            onSave={confirmEdit}
            onCancel={cancelEdit}
            saving={saving}
            error={error}
          />
        ) : (
          <div
            key={`${founder.name}-${index}`}
            className="group/founder flex items-center gap-2 rounded-lg border border-[#e6dccf] bg-white px-2.5 py-1.5"
          >
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label="Move up"
                className="text-[#8f8078] hover:text-[#4c433e] disabled:opacity-30"
              >
                <ChevronUp className="h-3 w-3" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === founders.length - 1}
                aria-label="Move down"
                className="text-[#8f8078] hover:text-[#4c433e] disabled:opacity-30"
              >
                <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </div>
            <p className="min-w-0 flex-1 truncate text-[13px] text-[#403833]">
              <span className="font-medium">{founder.name}</span> — {founder.title}
            </p>
            <button
              type="button"
              onClick={() => startEdit(index)}
              aria-label={`Edit ${founder.name}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#e2d6ca] text-[#4c433e] opacity-0 transition-opacity group-hover/founder:opacity-100"
            >
              <Pencil className="h-3 w-3" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Remove ${founder.name}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#f0c9c9] text-red-600 opacity-0 transition-opacity group-hover/founder:opacity-100"
            >
              <Trash2 className="h-3 w-3" strokeWidth={2} />
            </button>
          </div>
        )
      )}

      {editingIndex === -1 ? (
        <FounderRowEditor
          draft={draft}
          setDraft={setDraft}
          onSave={confirmEdit}
          onCancel={cancelEdit}
          saving={saving}
          error={error}
        />
      ) : (
        founders.length < MAX_FOUNDERS && (
          <button
            type="button"
            onClick={() => startEdit(-1)}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#c9b6a6] px-3 py-1.5 text-[11px] font-semibold text-[#C85956]"
          >
            <Plus className="h-3 w-3" strokeWidth={2} /> Add founder
          </button>
        )
      )}
    </div>
  );
}

function FounderRowEditor({
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
  error,
}: {
  draft: BrandFounder;
  setDraft: (value: BrandFounder) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
}) {
  return (
    <div className="rounded-lg border-2 border-[#C85956]/40 bg-white p-2.5">
      <div className="flex flex-wrap gap-1.5">
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Name"
          maxLength={80}
          disabled={saving}
          autoFocus
          className="min-w-0 flex-1 rounded-md border border-[#ddd2c8] px-2 py-1 text-xs outline-none focus:border-[#C85956]"
        />
        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="Title (e.g. Founder)"
          maxLength={40}
          disabled={saving}
          className="w-32 rounded-md border border-[#ddd2c8] px-2 py-1 text-xs outline-none focus:border-[#C85956]"
        />
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          aria-label="Save founder"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-[#3fae6a] text-white disabled:opacity-60"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          aria-label="Cancel"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600/90 text-white hover:bg-red-600"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        {error && <span className="text-[11px] text-red-600">{error}</span>}
      </div>
    </div>
  );
}
