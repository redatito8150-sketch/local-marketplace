"use client";

import { useState } from "react";
import { SlidersHorizontal, ChevronDown, Check } from "lucide-react";
import { FilterGroup } from "@/types";

function FilterSection({
  group,
  selectedIds,
  onToggle,
}: {
  group: FilterGroup;
  selectedIds: string[];
  onToggle: (optionId: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border-b border-stone-150 py-5 first:pt-0 last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-semibold text-ink">{group.title}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-ink-soft/60 transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <ul className="mt-4 space-y-3">
          {group.options.map((opt) => {
            const checked = selectedIds.includes(opt.id);
            return (
              <li key={opt.id}>
                <label className="flex cursor-pointer items-center justify-between group">
                  <span className="flex items-center gap-2.5">
                    <span
                      onClick={(e) => {
                        e.preventDefault();
                        onToggle(opt.id);
                      }}
                      className={`flex h-4 w-4 flex-none items-center justify-center rounded-[4px] border transition-colors ${
                        checked
                          ? "border-ink bg-ink"
                          : "border-stone-150 bg-white group-hover:border-ink/40"
                      }`}
                    >
                      {checked && (
                        <Check className="h-2.5 w-2.5 text-cream" strokeWidth={3} />
                      )}
                    </span>
                    <span className="text-[13px] text-ink-soft/80">
                      {opt.label}
                    </span>
                  </span>
                  {typeof opt.count === "number" && (
                    <span className="text-[12px] text-ink-soft/45">
                      ({opt.count})
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function FilterSidebar({
  groups,
  selected,
  onToggle,
  onClear,
}: {
  groups: FilterGroup[];
  selected: Record<string, string[]>;
  onToggle: (groupId: string, optionId: string) => void;
  onClear?: () => void;
}) {
  const hasActiveFilters = Object.values(selected).some((ids) => ids.length > 0);
  // Collapsed by default on mobile — the full ~25-row filter list otherwise
  // sits above the product grid, since the layout stacks to one column
  // below the `lg` breakpoint. Always expanded at `lg` and up.
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <aside className="w-full lg:w-[240px] lg:flex-none">
      <div className="mb-5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          className="flex items-center gap-2 lg:pointer-events-none"
        >
          <h2 className="text-base font-semibold text-ink">Filters</h2>
          <ChevronDown
            className={`h-4 w-4 text-ink-soft/60 transition-transform duration-300 lg:hidden ${
              mobileOpen ? "rotate-180" : ""
            }`}
          />
        </button>
        {hasActiveFilters && onClear ? (
          <button
            onClick={onClear}
            className="text-[12px] font-medium text-ink-soft/60 underline-offset-2 hover:text-ink hover:underline"
          >
            Clear all
          </button>
        ) : (
          <SlidersHorizontal className="h-4 w-4 text-ink-soft/60" strokeWidth={1.8} />
        )}
      </div>

      <div className={`${mobileOpen ? "block" : "hidden"} lg:block`}>
        {groups.map((group) => (
          <FilterSection
            key={group.id}
            group={group}
            selectedIds={selected[group.id] ?? []}
            onToggle={(optionId) => onToggle(group.id, optionId)}
          />
        ))}
      </div>
    </aside>
  );
}
