"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ProductMaterialEntry } from "@/types";

interface AccordionItem {
  title: string;
  content: React.ReactNode;
}

function Row({ item, defaultOpen }: { item: AccordionItem; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);

  return (
    <div className="border-b border-stone-150 py-5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <span className="text-[15px] font-semibold text-ink">{item.title}</span>
        <ChevronDown
          className={`h-4 w-4 text-ink-soft/60 transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && <div className="mt-3.5 text-[13.5px] leading-relaxed text-ink-soft/75">{item.content}</div>}
    </div>
  );
}

export default function ProductAccordion({
  description,
  details,
  careInstructions,
  materials,
  fit,
  shippingReturns,
}: {
  description: string;
  details: string[];
  careInstructions: string[];
  materials?: ProductMaterialEntry[];
  fit?: string;
  shippingReturns: string;
}) {
  // Preserves paragraph breaks as entered (a blank line separates
  // paragraphs) instead of collapsing them into one run of text.
  const paragraphs = description.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="mt-2">
      <Row
        defaultOpen
        item={{
          title: "Description & Highlights",
          content: (
            <div className="space-y-3">
              {paragraphs.map((paragraph, i) => (
                <p key={i} className="whitespace-pre-line">{paragraph}</p>
              ))}
              {details.length > 0 && (
                <ul className="list-disc space-y-1.5 pl-4">
                  {details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          ),
        }}
      />
      {careInstructions.length > 0 && (
        <Row
          item={{
            title: "Care Instructions",
            content: (
              <ul className="list-disc space-y-1.5 pl-4">
                {careInstructions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ),
          }}
        />
      )}
      {materials && materials.length > 0 && (
        <Row
          item={{
            title: "Materials",
            content: (
              <ul className="list-disc space-y-1.5 pl-4">
                {materials.map((m) => (
                  <li key={m.material}>{m.material} — {m.percentage}%</li>
                ))}
              </ul>
            ),
          }}
        />
      )}
      {fit && (
        <Row
          item={{
            title: "Fit",
            content: <p>{fit}</p>,
          }}
        />
      )}
      <Row
        item={{
          title: "Shipping & Returns",
          content: <p>{shippingReturns}</p>,
        }}
      />
    </div>
  );
}
