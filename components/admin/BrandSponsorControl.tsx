"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { SPONSOR_PLACEMENTS, type BrandSponsorPlacement } from "@/lib/admin/brandValidation";

const PLACEMENT_LABELS: Record<BrandSponsorPlacement, string> = {
  homepage_banner: "End of homepage",
  mega_menu_banner: "“Brands” mega menu banner",
  featured_brands_first: "First in Featured Brands",
};

// The Sponsored checkmark for a brand-list row — unlike Active/Partner
// (BrandQuickToggle), turning this on needs a placement choice, so
// enabling it opens an inline popover right there in the list (checkbox
// per placement + a tie-break order) instead of sending the admin to the
// full BrandForm edit page just to pick a spot. Rendered via a portal
// (not a plain absolute child) because the admin brands table sits
// inside DashboardPanel's `overflow-hidden` wrapper, which would clip an
// in-flow dropdown.
export default function BrandSponsorControl({
  slug,
  isSponsored: initialSponsored,
  placements: initialPlacements,
  order: initialOrder,
}: {
  slug: string;
  isSponsored: boolean;
  placements: string[];
  order?: number;
}) {
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [sponsored, setSponsored] = useState(initialSponsored);
  const [placements, setPlacements] = useState<BrandSponsorPlacement[]>(
    initialPlacements.filter((p): p is BrandSponsorPlacement => SPONSOR_PLACEMENTS.includes(p as BrandSponsorPlacement))
  );
  const [order, setOrder] = useState(initialOrder != null ? String(initialOrder) : "");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + window.scrollY + 6, left: rect.left + window.scrollX });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const save = async (next: { isSponsored: boolean; placements: BrandSponsorPlacement[]; order: string }) => {
    setPending(true);
    try {
      const res = await fetch(`/api/admin/brands/${slug}/sponsorship`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isSponsored: next.isSponsored,
          sponsoredPlacements: next.isSponsored ? next.placements : [],
          sponsoredOrder: next.order.trim() ? Number(next.order) : null,
        }),
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

  const toggleSponsored = () => {
    const next = !sponsored;
    setSponsored(next);
    setOpen(next);
    void save({ isSponsored: next, placements, order });
  };

  const togglePlacement = (placement: BrandSponsorPlacement) => {
    const next = placements.includes(placement)
      ? placements.filter((p) => p !== placement)
      : [...placements, placement];
    setPlacements(next);
    void save({ isSponsored: sponsored, placements: next, order });
  };

  const commitOrder = () => {
    void save({ isSponsored: sponsored, placements, order });
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleSponsored}
        disabled={pending}
        aria-pressed={sponsored}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold transition-colors disabled:opacity-50 ${
          sponsored ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
        }`}
      >
        <span
          className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
            sponsored ? "border-amber-600 bg-amber-500" : "border-slate-400 bg-white"
          }`}
        >
          {sponsored && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
        </span>
        Sponsored
      </button>

      {open && coords && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          style={{ position: "absolute", top: coords.top, left: coords.left }}
          className="z-50 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
        >
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
            Where should it appear?
          </p>
          <div className="mt-2 space-y-1.5">
            {SPONSOR_PLACEMENTS.map((placement) => (
              <label key={placement} className="flex items-center gap-2 text-[12.5px] text-slate-700">
                <input
                  type="checkbox"
                  checked={placements.includes(placement)}
                  onChange={() => togglePlacement(placement)}
                  className="h-3.5 w-3.5 accent-ink"
                />
                {PLACEMENT_LABELS[placement]}
              </label>
            ))}
          </div>
          <label className="mt-2.5 block text-[10.5px] font-medium text-slate-500">
            Display order (only matters if another brand shares a placement)
            <input
              type="number"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              onBlur={commitOrder}
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-[12.5px]"
            />
          </label>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2.5 w-full rounded-md bg-slate-100 py-1.5 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-200"
          >
            Done
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
