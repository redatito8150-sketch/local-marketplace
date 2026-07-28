"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import ColorSwatch from "./ColorSwatch";
import type { OptionSwatchType } from "@/types";

export interface SelectableColorValue {
  id: string;
  label: string;
  swatchType?: OptionSwatchType;
  primaryColor?: string;
  secondaryColor?: string;
}

export interface NewColorInput {
  label: string;
  swatchType: OptionSwatchType;
  primaryColor: string;
  secondaryColor?: string;
}

export default function ColorOptionPicker({
  options,
  selectedIds,
  onToggle,
  onCreate,
  disabled,
}: {
  options: SelectableColorValue[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onCreate?: (input: NewColorInput) => Promise<void> | void;
  disabled?: boolean;
}) {
  const selected = selectedIds
    .map((id) => options.find((o) => o.id === id))
    .filter((o): o is SelectableColorValue => Boolean(o));

  return (
    <div>
      <span className="text-[12.5px] font-medium text-ink-soft/70">Color</span>

      {selected.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {selected.map((option) => (
            <span
              key={option.id}
              className="flex items-center gap-1.5 rounded-full bg-ink py-1 pl-1.5 pr-2.5 text-[12px] font-medium text-cream"
            >
              <ColorSwatch swatchType={option.swatchType} primaryColor={option.primaryColor} secondaryColor={option.secondaryColor} size={14} />
              {option.label}
              <button type="button" onClick={() => onToggle(option.id)} aria-label={`Remove ${option.label}`} className="rounded-full hover:bg-white/20">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selectedIds.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(option.id)}
              aria-pressed={active}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                active ? "border-ink bg-ink text-cream" : "border-stone-200 text-ink-soft/70 hover:border-ink/40"
              }`}
            >
              <ColorSwatch swatchType={option.swatchType} primaryColor={option.primaryColor} secondaryColor={option.secondaryColor} size={14} />
              {option.label}
            </button>
          );
        })}
      </div>

      {onCreate && !disabled && <CreateColorForm onCreate={onCreate} />}
    </div>
  );
}

function CreateColorForm({ onCreate }: { onCreate: (input: NewColorInput) => Promise<void> | void }) {
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [swatchType, setSwatchType] = useState<OptionSwatchType>("single");
  const [primaryColor, setPrimaryColor] = useState("#000000");
  const [secondaryColor, setSecondaryColor] = useState("#ffffff");
  const [busy, setBusy] = useState(false);

  if (!creating) {
    return (
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink hover:underline"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        Create custom color
      </button>
    );
  }

  const handleCreate = async () => {
    if (!label.trim()) return;
    setBusy(true);
    try {
      await onCreate({
        label: label.trim(),
        swatchType,
        primaryColor,
        secondaryColor: swatchType === "split" ? secondaryColor : undefined,
      });
      setCreating(false);
      setLabel("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-stone-150 bg-stone-50/60 p-2.5">
      <input
        type="text"
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Color name"
        className="w-32 rounded-md border border-stone-150 bg-white px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink/30"
      />
      <select
        value={swatchType}
        onChange={(e) => setSwatchType(e.target.value as OptionSwatchType)}
        className="rounded-md border border-stone-150 bg-white px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-ink/30"
      >
        <option value="single">Single Color</option>
        <option value="split">Two Colors</option>
        <option value="multicolor">Multicolor</option>
      </select>
      {swatchType !== "multicolor" && (
        <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-8 w-10 rounded border border-stone-150" />
      )}
      {swatchType === "split" && (
        <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="h-8 w-10 rounded border border-stone-150" />
      )}
      <button type="button" onClick={handleCreate} disabled={busy || !label.trim()} className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-semibold text-cream disabled:opacity-50">
        Add
      </button>
      <button type="button" onClick={() => setCreating(false)} className="text-[12px] text-ink-soft/60 hover:underline">
        Cancel
      </button>
    </div>
  );
}
