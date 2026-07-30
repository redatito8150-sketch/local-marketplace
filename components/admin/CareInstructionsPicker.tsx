"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { CARE_INSTRUCTION_GROUPS } from "@/content/careInstructions";

// Searchable multi-select over the fixed Fashion care-instruction catalog
// — no free-text entries. Groups are collapsed by default; clicking one
// shows only that group's own options (one open at a time), instead of
// every group's options all visible and scrolling together. Typing a
// search query bypasses the accordion entirely and shows matches from
// every group flattened, each labeled with its group name.
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
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const toggle = (option: string) => {
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  };

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return CARE_INSTRUCTION_GROUPS.flatMap((group) =>
      group.options.filter((o) => o.toLowerCase().includes(q)).map((option) => ({ option, group: group.group }))
    );
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

      {searchResults ? (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-stone-150 p-2">
          {searchResults.length === 0 && <p className="px-2 py-3 text-[12.5px] text-ink-soft/50">No matches.</p>}
          <div className="flex flex-wrap gap-1.5 px-1">
            {searchResults.map(({ option, group }) => {
              const active = value.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(option)}
                  title={group}
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
      ) : (
        <div className="mt-2 space-y-1.5 rounded-md border border-stone-150 p-1.5">
          {CARE_INSTRUCTION_GROUPS.map((group) => {
            const isOpen = openGroup === group.group;
            const selectedInGroup = group.options.filter((o) => value.includes(o)).length;
            return (
              <div key={group.group} className="overflow-hidden rounded-md">
                <button
                  type="button"
                  onClick={() => setOpenGroup(isOpen ? null : group.group)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-stone-50"
                >
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-ink-soft/40" /> : <ChevronRight className="h-3.5 w-3.5 text-ink-soft/40" />}
                  <span className="text-[12.5px] font-semibold text-ink">{group.group}</span>
                  {selectedInGroup > 0 && (
                    <span className="ml-auto rounded-full bg-stone-150 px-2 py-0.5 text-[10.5px] font-medium text-ink-soft/60">{selectedInGroup} selected</span>
                  )}
                </button>
                {isOpen && (
                  <div className="flex flex-wrap gap-1.5 px-2 pb-2.5 pt-1">
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
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
