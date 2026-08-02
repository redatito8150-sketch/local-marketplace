"use client";

import { useRef, useState } from "react";
import {
  Award,
  Check,
  Heart,
  MapPin,
  Package,
  Palette,
  Pencil,
  Plus,
  Rocket,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Trash2,
  Trophy,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useBrandEdit } from "./BrandEditContext";
import type { BrandJourneyMilestone, JourneyIconKey } from "@/types";
import { JOURNEY_ICON_KEYS } from "@/lib/brandJourneyIcons";

const MAX_CUSTOM = 10;
const CURRENT_YEAR = new Date().getFullYear();

const ICON_COMPONENTS: Record<JourneyIconKey, LucideIcon> = {
  sparkles: Sparkles,
  store: Store,
  heart: Heart,
  award: Award,
  rocket: Rocket,
  package: Package,
  star: Star,
  trophy: Trophy,
  palette: Palette,
  users: Users,
  "map-pin": MapPin,
  "shopping-bag": ShoppingBag,
};

interface ComputedMilestone {
  year: string;
  title: string;
  description: string;
}

interface TimelineEntry {
  key: string;
  year: number;
  title: string;
  description: string;
  icon: JourneyIconKey;
  variant: "gold" | "red";
  customIndex: number | null; // null for the two always-real computed entries
}

function emptyDraft(): BrandJourneyMilestone {
  return { year: "", title: "", description: "", icon: "sparkles" };
}

// The About page's "Our journey" strip. "Founded" and "Joined Mahaly" are
// always real (foundedYear / the brand's own createdAt on Mahaly — see
// app/brands/[slug]/about/page.tsx) and never editable; everything else is
// an owner/admin-managed custom milestone, saved through the same
// field="journeyMilestones" branch as every other inline edit on this page
// (app/api/brands/[slug]/inline-edit). The whole strip — real and custom
// alike — is sorted chronologically by year, so a custom entry can land
// before "Founded" or after "Joined Mahaly" without any special-casing.
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

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
    const yearNum = Number(draft.year);
    if (!draft.year.trim() || !Number.isInteger(yearNum) || yearNum < 1900 || yearNum > CURRENT_YEAR + 10) {
      setError("Enter a valid year");
      return;
    }
    if (!draft.title.trim()) {
      setError("Title is required");
      return;
    }
    const next = [...custom];
    const cleaned = { ...draft, year: String(yearNum), title: draft.title.trim(), description: draft.description.trim() };
    if (editingIndex === -1) next.push(cleaned);
    else if (editingIndex !== null) next[editingIndex] = cleaned;
    const ok = await save(next);
    if (ok) setEditingIndex(null);
  };

  const remove = async (index: number) => {
    await save(custom.filter((_, i) => i !== index));
  };

  // Every entry — the two always-real ones and every custom one — sorted
  // together by year, left to right.
  const entries: TimelineEntry[] = [
    ...(founded ? [{ key: "founded", year: Number(founded.year), title: founded.title, description: founded.description, icon: "sparkles" as JourneyIconKey, variant: "gold" as const, customIndex: null }] : []),
    { key: "joined-mahaly", year: Number(joinedMahaly.year), title: joinedMahaly.title, description: joinedMahaly.description, icon: "store" as JourneyIconKey, variant: "gold" as const, customIndex: null },
    ...custom.map((item, index) => ({
      key: `custom-${index}`,
      year: Number(item.year),
      title: item.title,
      description: item.description,
      icon: item.icon,
      variant: "red" as const,
      customIndex: index,
    })),
  ].sort((a, b) => a.year - b.year);

  const startDrag = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, textarea")) return;
    if (!scrollRef.current) return;
    drag.current = { startX: e.pageX, startScroll: scrollRef.current.scrollLeft, moved: false };
    setIsDragging(true);
  };

  const onDrag = (e: React.MouseEvent) => {
    if (!drag.current || !scrollRef.current) return;
    const dx = e.pageX - drag.current.startX;
    if (Math.abs(dx) > 3) drag.current.moved = true;
    scrollRef.current.scrollLeft = drag.current.startScroll - dx;
  };

  const endDrag = () => {
    drag.current = null;
    setIsDragging(false);
  };

  return (
    <div className="relative mt-7">
      <div
        ref={scrollRef}
        onMouseDown={startDrag}
        onMouseMove={onDrag}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        className={`no-scrollbar overflow-x-auto pb-2 ${isDragging ? "cursor-grabbing select-none" : "cursor-grab"}`}
      >
      {/* w-max so this inner row sizes to its natural (unclipped) content
          width — the connecting line below is positioned relative to that,
          so it scrolls together with the circles instead of staying fixed
          to the viewport. */}
      <div className="relative flex w-max gap-4">
        <div
          className="absolute left-6 right-6 top-6 h-px bg-[#bd8a8e]"
          aria-hidden="true"
        />
        {entries.map((item) => {
          const isEditingThis = item.customIndex !== null && editingIndex === item.customIndex;
          const Icon = ICON_COMPONENTS[item.icon] ?? Sparkles;

          if (isEditingThis) {
            return (
              <MilestoneEditor
                key={item.key}
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
            <article key={item.key} className="group/milestone relative w-[168px] shrink-0 text-center">
              <div
                className={`relative z-10 mx-auto grid h-12 w-12 place-items-center rounded-full text-white shadow-[0_4px_14px_rgba(143,38,52,0.2)] ${
                  item.variant === "gold" ? "bg-[#c9962c]" : "bg-[#8f2634]"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={1.7} />
              </div>
              <p className="mt-4 text-sm font-semibold text-[#514740]">{item.year}</p>
              <h3 className="mt-1 text-[13px] font-bold text-[#302925]">{item.title}</h3>
              <p className="mx-auto mt-2 max-w-[190px] text-[12px] leading-5 text-[#766d66]">{item.description}</p>
              {item.customIndex !== null && canEdit && (
                <span className="absolute -top-1 right-[calc(50%-46px)] flex gap-1 opacity-0 transition group-hover/milestone:opacity-100">
                  <button
                    type="button"
                    onClick={() => startEdit(item.customIndex!)}
                    aria-label="Edit milestone"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-black/10 hover:bg-black/20"
                  >
                    <Pencil className="h-3 w-3" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(item.customIndex!)}
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

        {canEdit && custom.length < MAX_CUSTOM && editingIndex !== -1 && (
          <button
            type="button"
            onClick={() => startEdit(-1)}
            className="flex w-[168px] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#c9b6a6] px-3 py-4 text-[12px] font-semibold text-[#8f2634] opacity-70 transition hover:opacity-100"
          >
            <Plus className="h-5 w-5" strokeWidth={2} />
            Add milestone
          </button>
        )}
      </div>
      </div>
      {canEdit && (
        <p className="mt-2 text-[11px] text-[#8f8078]">Drag the timeline to scroll — sorted automatically by year.</p>
      )}
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
    <div className="w-[210px] shrink-0 rounded-2xl border-2 border-[#8f2634]/40 bg-white p-3 text-left">
      <div className="flex flex-wrap gap-1.5">
        {JOURNEY_ICON_KEYS.map((key) => {
          const Icon = ICON_COMPONENTS[key];
          const selected = draft.icon === key;
          return (
            <button
              type="button"
              key={key}
              onClick={() => setDraft({ ...draft, icon: key })}
              aria-label={`Icon: ${key}`}
              aria-pressed={selected}
              disabled={saving}
              className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${
                selected ? "border-[#8f2634] bg-[#8f2634] text-white" : "border-[#ddd2c8] text-[#6d625b] hover:border-[#8f2634]/50"
              }`}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          );
        })}
      </div>
      <input
        value={draft.year}
        onChange={(e) => setDraft({ ...draft, year: e.target.value })}
        placeholder="Year (e.g. 2024)"
        inputMode="numeric"
        maxLength={4}
        disabled={saving}
        className="mt-2 w-full rounded-md border border-[#ddd2c8] px-2 py-1 text-xs outline-none focus:border-[#8f2634]"
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
      <div className="mt-2 flex flex-wrap items-center gap-2">
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
