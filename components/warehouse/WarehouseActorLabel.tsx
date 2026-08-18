"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeInfo } from "lucide-react";
import type { WarehouseActorIdentity } from "@/lib/data/warehouse";

export default function WarehouseActorLabel({ actor, canReveal }: { actor: WarehouseActorIdentity | null; canReveal: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const publicName = actor?.isStaff ? "Zakhnook Staff Team" : actor ? `@${actor.displayName}` : "Zakhnook Staff Team";

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <span ref={rootRef} className="relative inline-flex flex-wrap items-center gap-1">
    <span className="font-semibold text-[#62564d]">{publicName}</span>
    {canReveal && actor?.email ? <>
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-label={`View identity for ${publicName}`} className="inline-flex items-center rounded-full text-[#9a8c82] outline-none hover:text-[#C85956] focus-visible:ring-2 focus-visible:ring-[#C85956]/25">
        <BadgeInfo className="h-3 w-3" />
      </button>
      {open ? <span role="status" className="absolute bottom-full left-1/2 z-30 mb-1.5 w-max min-w-40 max-w-64 -translate-x-1/2 rounded-lg bg-[#302924] px-2.5 py-2 text-[9px] text-white shadow-lg">
        <span className="block font-extrabold">{actor.displayName}</span>
        <span className="mt-0.5 block text-white/70">{actor.roleLabel}</span>
        <span className="mt-1 block font-medium text-white/90">{actor.email}</span>
      </span> : null}
    </> : null}
  </span>;
}
