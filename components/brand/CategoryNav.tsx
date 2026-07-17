"use client";

import { useState } from "react";
import { BrandCategoryTab } from "@/types";

export default function CategoryNav({
  tabs,
  defaultActive,
}: {
  tabs: BrandCategoryTab[];
  defaultActive: string;
}) {
  const [active, setActive] = useState(defaultActive);

  return (
    <nav
      aria-label="Shop categories"
      className="mx-auto max-w-brand border-y border-hairline px-6 lg:px-10"
    >
      <ul className="flex items-center gap-9 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <li key={tab.id} className="flex-none">
              <button
                onClick={() => setActive(tab.id)}
                className={`relative py-5 text-[13px] font-medium tracking-wide transition-colors ${
                  isActive ? "text-navy" : "text-charcoal/55 hover:text-charcoal"
                }`}
              >
                {tab.label}
                <span
                  className={`absolute inset-x-0 -bottom-px h-[2px] transition-opacity ${
                    isActive ? "bg-navy opacity-100" : "opacity-0"
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
