"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useBrandEdit } from "./BrandEditContext";

const MAX_FOUNDERS = 5;

function foundersLabel(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} — Founder`;
  if (names.length === 2) return `${names[0]} & ${names[1]} — Founders`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]} — Founders`;
}

// The About page's "who founded this" byline — plural on purpose (a brand
// can credit more than one person), saved as one array via the same
// field="founderNames" branch as every other inline edit on this page
// (app/api/brands/[slug]/inline-edit).
export default function FounderNamesEditor({ initial }: { initial: string[] }) {
  const { canEdit, brandSlug } = useBrandEdit();
  const [names, setNames] = useState(initial);
  const [editingIndex, setEditingIndex] = useState<number | null>(null); // -1 = adding new
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (next: string[]) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/brands/${brandSlug}/inline-edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: "founderNames", value: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return false;
      }
      setNames(next);
      return true;
    } catch {
      setError("Failed to save. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (index: number) => {
    setDraft(index === -1 ? "" : names[index]);
    setEditingIndex(index);
    setError("");
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setError("");
  };

  const confirmEdit = async () => {
    if (!draft.trim()) {
      setError("Name is required");
      return;
    }
    const next = [...names];
    if (editingIndex === -1) next.push(draft.trim());
    else if (editingIndex !== null) next[editingIndex] = draft.trim();
    const ok = await save(next);
    if (ok) setEditingIndex(null);
  };

  const remove = async (index: number) => {
    await save(names.filter((_, i) => i !== index));
  };

  if (!canEdit && names.length === 0) return null;

  const label = foundersLabel(names);

  if (!canEdit) {
    return label ? (
      <p className="pl-[52px] text-[13px] leading-6 text-[#403833] lg:pl-0">
        <span className="font-medium">{label}</span>
      </p>
    ) : null;
  }

  return (
    <div className="pl-[52px] lg:pl-0">
      {label && editingIndex === null && (
        <p className="text-[13px] leading-6 text-[#403833]">
          <span className="font-medium">{label}</span>
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {names.map((name, index) =>
          editingIndex === index ? (
            <NameEditor
              key={`${name}-${index}`}
              draft={draft}
              setDraft={setDraft}
              onSave={confirmEdit}
              onCancel={cancelEdit}
              saving={saving}
              error={error}
            />
          ) : (
            <span
              key={`${name}-${index}`}
              className="group/founder inline-flex items-center gap-1 rounded-full border border-[#ddd2c8] bg-white px-2.5 py-1 text-[11px] text-[#4c433e]"
            >
              {name}
              <button
                type="button"
                onClick={() => startEdit(index)}
                aria-label={`Edit ${name}`}
                className="opacity-0 transition-opacity group-hover/founder:opacity-100"
              >
                <Pencil className="h-2.5 w-2.5" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Remove ${name}`}
                className="opacity-0 transition-opacity group-hover/founder:opacity-100"
              >
                <Trash2 className="h-2.5 w-2.5 text-red-600" strokeWidth={2} />
              </button>
            </span>
          )
        )}
        {editingIndex === -1 ? (
          <NameEditor
            draft={draft}
            setDraft={setDraft}
            onSave={confirmEdit}
            onCancel={cancelEdit}
            saving={saving}
            error={error}
          />
        ) : (
          names.length < MAX_FOUNDERS && (
            <button
              type="button"
              onClick={() => startEdit(-1)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#c9b6a6] px-2.5 py-1 text-[11px] font-semibold text-[#8f2634]"
            >
              <Plus className="h-3 w-3" strokeWidth={2} /> Add founder
            </button>
          )
        )}
      </div>
    </div>
  );
}

function NameEditor({
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
  error,
}: {
  draft: string;
  setDraft: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#8f2634]/40 bg-white px-2 py-1">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Founder name"
        maxLength={80}
        disabled={saving}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave();
          if (e.key === "Escape") onCancel();
        }}
        className="w-32 text-[11px] outline-none"
      />
      <button type="button" onClick={onSave} disabled={saving} aria-label="Save">
        <Check className="h-3 w-3 text-mahalyred" strokeWidth={2.5} />
      </button>
      <button type="button" onClick={onCancel} disabled={saving} aria-label="Cancel">
        <X className="h-3 w-3 text-red-600" strokeWidth={2.5} />
      </button>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </span>
  );
}
