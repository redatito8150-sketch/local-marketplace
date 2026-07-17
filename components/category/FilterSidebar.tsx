"use client";

import { useState } from "react";
import { SlidersHorizontal, ChevronDown, Check } from "lucide-react";
import { FilterGroup } from "@/types";

function FilterSection({ group }: { group: FilterGroup }) {
  const [open, setOpen] = useState(true);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

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
          {group.options.map((opt) => (
            <li key={opt.id}>
              <label className="flex cursor-pointer items-center justify-between group">
                <span className="flex items-center gap-2.5">
                  <span
                    onClick={(e) => {
                      e.preventDefault();
                      toggle(opt.id);
                    }}
                    className={`flex h-4 w-4 flex-none items-center justify-center rounded-[4px] border transition-colors ${
                      checked[opt.id]
                        ? "border-ink bg-ink"
                        : "border-stone-150 bg-white group-hover:border-ink/40"
                    }`}
                  >
                    {checked[opt.id] && (
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
          ))}
        </ul>
      )}
    </div>
  );
}

export default function FilterSidebar({ groups }: { groups: FilterGroup[] }) {
  return (
    <aside className="w-full lg:w-[240px] lg:flex-none">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">Filters</h2>
        <SlidersHorizontal className="h-4 w-4 text-ink-soft/60" strokeWidth={1.8} />
      </div>

      <div>
        {groups.map((group) => (
          <FilterSection key={group.id} group={group} />
        ))}
      </div>
    </aside>
  );
}
