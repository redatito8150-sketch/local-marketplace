"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { CARE_INSTRUCTION_GROUPS } from "@/content/careInstructions";

// Searchable multi-select over the fixed Fashion care-instruction catalog
// — no free-text entries. Selection order is preserved (chips render in
// the order picked, not catalog order).
export default function CareInstructionsPicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");

  const toggle = (option: string) => {
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  };

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CARE_INSTRUCTION_GROUPS;
    return CARE_INSTRUCTION_GROUPS
      .map((group) => ({ ...group, options: group.options.filter((o) => o.toLowerCase().includes(q)) }))
      .filter((group) => group.options.length > 0);
  }, [query]);

  return (
    <div>
      <span className="text-[12.5px] font-medium text-ink-soft/70">Care Instructions</span>

      {value.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {value.map((item) => (
            <span key={item} className="flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-[12px] font-medium text-cream">
              {item}
              <button type="button" onClick={() => toggle(item)} aria-label={`Remove ${item}`} className="rounded-full hover:bg-white/20">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft/40" />
        <input
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search care instructions…"
          aria-label="Search care instructions"
          className="w-full rounded-md border border-stone-150 bg-white py-2.5 pl-9 pr-3.5 text-[14px] text-ink outline-none focus:border-ink/30 disabled:cursor-not-allowed disabled:bg-stone-50"
        />
      </div>

      <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-stone-150 p-2">
        {filteredGroups.length === 0 && <p className="px-2 py-3 text-[12.5px] text-ink-soft/50">No matches.</p>}
        {filteredGroups.map((group) => (
          <div key={group.group} className="mb-2 last:mb-0">
            <p className="px-1 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft/45">{group.group}</p>
            <div className="flex flex-wrap gap-1.5 px-1">
              {group.options.map((option) => {
                const active = value.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(option)}
                    aria-pressed={active}
                    className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      active ? "border-ink bg-ink text-cream" : "border-stone-200 text-ink-soft/70 hover:border-ink/40"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
