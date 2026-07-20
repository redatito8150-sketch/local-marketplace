"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ProductPauseToggle({
  productId,
  paused,
}: {
  productId: string;
  paused: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/brand-portal/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle-pause", pausedByBrand: !paused }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to update");
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
      onClick={toggle}
      disabled={busy}
      className={`rounded-md border px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60 ${
        paused
          ? "border-stone-150 text-ink hover:bg-stone-100"
          : "border-red-200 text-red-700 hover:bg-red-50"
      }`}
    >
      {busy ? "…" : paused ? "Unpause" : "Pause"}
    </button>
  );
}
