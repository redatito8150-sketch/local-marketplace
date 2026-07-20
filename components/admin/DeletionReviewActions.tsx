"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeletionReviewActions({
  productId,
  name,
}: {
  productId: string;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const decide = async (approve: boolean) => {
    if (approve && !confirm(`Permanently delete "${name}"? This can't be undone.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/products/${productId}/deletion-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to save decision");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-none items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => decide(true)}
        className="rounded-md border border-red-100 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        Approve Deletion
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => decide(false)}
        className="rounded-md border border-stone-150 bg-white px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-stone-50 disabled:opacity-60"
      >
        Reject
      </button>
    </div>
  );
}
