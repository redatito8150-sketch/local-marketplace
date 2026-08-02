"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Sparkles, Store, Trash2, X } from "lucide-react";
import { useBrandEdit } from "./BrandEditContext";
import type { BrandJourneyMilestone } from "@/types";

const MAX_CUSTOM = 2;

// Tailwind's JIT scanner needs a literal class name per breakpoint count —
// a template-string class like `sm:grid-cols-${n}` would never make it
// into the generated CSS, so the mapping has to be spelled out.
const GRID_COLS_CLASS: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

interface ComputedMilestone {
  year: string;
  title: string;
  description: string;
}

interface TimelineEntry extends BrandJourneyMilestone {
  editable: boolean;
}

function emptyDraft(): BrandJourneyMilestone {
  return { year: "", title: "", description: "" };
}

// The About page's "Our journey" strip. Two entries either side are always
// real and never editable (foundedYear / the brand's own createdAt on
// Mahaly — see app/brands/[slug]/about/page.tsx); this component's own job
// is just the owner/admin-managed custom milestones in between, saved
// through the same field="journeyMilestones" branch as every other inline
// edit on this page (app/api/brands/[slug]/inline-edit).
export default function BrandJourneyTimeline({
  founded,
  joinedMahaly,
  initialCustom,
}: {
  founded: ComputedMilestone | null;
  joinedMahaly: ComputedMilestone;
  initialCustom: BrandJourneyMilestone[];
}) {
  const { canEdit, brandSlug } = useBrandEdit();
  const [custom, setCustom] = useState(initialCustom);
  const [editingIndex, setEditingIndex] = useState<number | null>(null); // -1 = adding new
  const [draft, setDraft] = useState<BrandJourneyMilestone>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (next: BrandJourneyMilestone[]) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/brands/${brandSlug}/inline-edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: "journeyMilestones", value: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return false;
      }
      setCustom(next);
      return true;
    } catch {
      setError("Failed to save. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (index: number) => {
    setDraft(index === -1 ? emptyDraft() : custom[index]);
    setEditingIndex(index);
    setError("");
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setError("");
  };

  const confirmEdit = async () => {
    if (!draft.year.trim() || !draft.title.trim()) {
      setError("Year and title are required");
      return;
    }
    const next = [...custom];
    if (editingIndex === -1) next.push(draft);
    else if (editingIndex !== null) next[editingIndex] = draft;
    const ok = await save(next);
    if (ok) setEditingIndex(null);
  };

  const remove = async (index: number) => {
    await save(custom.filter((_, i) => i !== index));
  };

  const entries: TimelineEntry[] = [
    ...(founded ? [{ ...founded, editable: false }] : []),
    ...custom.map((item) => ({ ...item, editable: true })),
    { ...joinedMahaly, editable: false },
  ];

  const showAddSlot = canEdit && custom.length < MAX_CUSTOM && editingIndex !== -1;
  const columnCount = entries.length + (showAddSlot ? 1 : 0);

  return (
    <div className="relative mt-7">
      {columnCount > 1 && (
        <div
          className="absolute left-[4%] right-[4%] top-6 hidden h-px bg-[#bd8a8e] sm:block"
          aria-hidden="true"
        />
      )}
      <div
        className={`relative mx-auto grid max-w-md gap-8 sm:max-w-none sm:gap-4 ${
          GRID_COLS_CLASS[Math.min(Math.max(columnCount, 1), 4)]
        }`}
      >
        {entries.map((item, index) => {
          const customIndex = founded ? index - 1 : index;
          const isEditingThis = item.editable && editingIndex === customIndex;
          // "Joined Mahaly" is always the last computed entry; every other
          // entry (Founded + any custom milestones) reads as a Sparkles beat.
          const Icon = index === entries.length - 1 ? Store : Sparkles;

          if (isEditingThis) {
            return (
              <MilestoneEditor
                key={`editing-${customIndex}`}
                draft={draft}
                setDraft={setDraft}
                onSave={confirmEdit}
                onCancel={cancelEdit}
                saving={saving}
                error={error}
              />
            );
          }

          return (
            <article key={`${item.title}-${index}`} className="group/milestone relative text-center">
              <div className="relative z-10 mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#8f2634] text-white shadow-[0_4px_14px_rgba(143,38,52,0.2)]">
                <Icon className="h-5 w-5" strokeWidth={1.7} />
              </div>
              <p className="mt-4 text-sm font-semibold text-[#514740]">{item.year}</p>
              <h3 className="mt-1 text-[13px] font-bold text-[#302925]">{item.title}</h3>
              <p className="mx-auto mt-2 max-w-[190px] text-[12px] leading-5 text-[#766d66]">{item.description}</p>
              {item.editable && canEdit && (
                <span className="absolute -top-1 right-[calc(50%-46px)] flex gap-1 opacity-0 transition group-hover/milestone:opacity-100">
                  <button
                    type="button"
                    onClick={() => startEdit(customIndex)}
                    aria-label="Edit milestone"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-black/10 hover:bg-black/20"
                  >
                    <Pencil className="h-3 w-3" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(customIndex)}
                    aria-label="Remove milestone"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-black/10 hover:bg-red-100 hover:text-red-600"
                  >
                    <Trash2 className="h-3 w-3" strokeWidth={2} />
                  </button>
                </span>
              )}
            </article>
          );
        })}

        {editingIndex === -1 && (
          <MilestoneEditor
            draft={draft}
            setDraft={setDraft}
            onSave={confirmEdit}
            onCancel={cancelEdit}
            saving={saving}
            error={error}
          />
        )}

        {showAddSlot && (
          <button
            type="button"
            onClick={() => startEdit(-1)}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#c9b6a6] px-3 py-4 text-[12px] font-semibold text-[#8f2634] opacity-70 transition hover:opacity-100"
          >
            <Plus className="h-5 w-5" strokeWidth={2} />
            Add milestone
          </button>
        )}
      </div>
    </div>
  );
}

function MilestoneEditor({
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
  error,
}: {
  draft: BrandJourneyMilestone;
  setDraft: (value: BrandJourneyMilestone) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
}) {
  return (
    <div className="rounded-2xl border-2 border-[#8f2634]/40 bg-white p-3 text-left">
      <input
        value={draft.year}
        onChange={(e) => setDraft({ ...draft, year: e.target.value })}
        placeholder="Year (e.g. 2024)"
        maxLength={20}
        disabled={saving}
        className="w-full rounded-md border border-[#ddd2c8] px-2 py-1 text-xs outline-none focus:border-[#8f2634]"
      />
      <input
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        placeholder="Milestone title"
        maxLength={60}
        disabled={saving}
        className="mt-1.5 w-full rounded-md border border-[#ddd2c8] px-2 py-1 text-xs outline-none focus:border-[#8f2634]"
      />
      <textarea
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        placeholder="Short description"
        maxLength={200}
        rows={2}
        disabled={saving}
        className="mt-1.5 w-full rounded-md border border-[#ddd2c8] px-2 py-1 text-xs outline-none focus:border-[#8f2634]"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          aria-label="Save milestone"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-[#8f2634] text-white disabled:opacity-60"
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
