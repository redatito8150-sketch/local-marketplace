"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Replaces the old Pause toggle on a published product's row — one clear
// action instead of two overlapping ones (paused-but-still-"published" vs.
// actually archived). Instant, no review — same as every other
// brand-initiated status change.
export default function ProductArchiveButton({ productId, name }: { productId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const archive = async () => {
    if (!confirm(`Archive "${name}"? It comes off the storefront immediately — filter by Archived to find and republish it later.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/brand-portal/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to archive");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={archive}
      disabled={busy}
      className="rounded-md border border-stone-150 px-3 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-stone-100 disabled:opacity-60"
    >
      {busy ? "…" : "Archive"}
    </button>
  );
}
