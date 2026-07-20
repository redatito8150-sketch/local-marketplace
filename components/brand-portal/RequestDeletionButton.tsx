"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export default function RequestDeletionButton({
  productId,
  name,
  alreadyRequested,
}: {
  productId: string;
  name: string;
  alreadyRequested: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (alreadyRequested) {
    return <span className="text-[11.5px] text-ink-soft/50">Deletion requested</span>;
  }

  const handleClick = async () => {
    if (!confirm(`Request deletion of "${name}"? An admin will review this request before it's removed.`))
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/brand-portal/products/${productId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to request deletion");
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
      onClick={handleClick}
      disabled={busy}
      aria-label={`Request deletion of ${name}`}
      className="rounded-md p-1.5 text-ink-soft/60 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" strokeWidth={1.6} />
    </button>
  );
}
