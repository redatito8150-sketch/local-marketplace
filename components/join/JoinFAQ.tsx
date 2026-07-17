"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { JOIN_FAQ } from "@/content/join";

export default function JoinFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div>
      <h2 className="font-serif text-2xl font-semibold text-ink lg:text-3xl">FAQ</h2>

      <div className="mt-6">
        {JOIN_FAQ.map((item, index) => {
          const open = openIndex === index;
          const panelId = `join-faq-panel-${index}`;
          return (
            <div key={item.question} className="border-b border-stone-150">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenIndex(open ? null : index)}
                className="flex w-full items-center justify-between gap-4 py-4 text-left"
              >
                <span className="text-[14.5px] font-medium text-ink">{item.question}</span>
                <ChevronDown
                  className={`h-4 w-4 flex-none text-ink-soft/60 transition-transform duration-300 ${
                    open ? "rotate-180" : ""
                  }`}
                />
              </button>
              <div
                id={panelId}
                role="region"
                className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                  open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="overflow-hidden">
                  <p className="pb-4 text-[13.5px] leading-relaxed text-ink-soft/70">
                    {item.answer}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
