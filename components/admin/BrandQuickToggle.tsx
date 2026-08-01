"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

// A single instant on/off checkmark for a brand-list row — Active/
// Partner — mirroring DeleteEntityButton's fetch-then-router.refresh()
// shape, but PATCHing the lightweight quick-toggle route instead of the
// full BrandForm payload (which the list page doesn't have loaded).
// Sponsored has its own control (BrandSponsorControl) since turning it on
// also needs a placement picker.
export default function BrandQuickToggle({
  slug,
  field,
  active,
  label,
}: {
  slug: string;
  field: "isActive" | "isMahalyPartner";
  active: boolean;
  label: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleToggle = async () => {
    setPending(true);
    try {
      const res = await fetch(`/api/admin/brands/${slug}/quick-toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value: !active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to update");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={pending}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold transition-colors disabled:opacity-50 ${
        active
          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
      }`}
    >
      <span
        className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
          active ? "border-emerald-600 bg-emerald-500" : "border-slate-400 bg-white"
        }`}
      >
        {active && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
      </span>
      {label}
    </button>
  );
}
