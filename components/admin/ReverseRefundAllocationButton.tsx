"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAppError } from "@/lib/errors/client";
import InlineError from "@/components/shared/InlineError";
import type { AppError } from "@/types";

export default function ReverseRefundAllocationButton({
  orderId,
  allocationId,
}: {
  orderId: string;
  allocationId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[10.5px] font-semibold text-red-700 hover:underline">
        Reverse allocation
      </button>
    );
  }

  const submit = async () => {
    if (!reason.trim()) return;
    setSaving(true);
    setError(null);
    const result = await fetchWithAppError(`/api/admin/orders/${orderId}/refunds/${allocationId}/reverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="mt-2 space-y-2">
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Required correction reason"
        className="w-full rounded-md border border-stone-200 px-2.5 py-1.5 text-[11px] outline-none focus:border-stone-300"
      />
      {error && <InlineError error={error} />}
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="text-[10.5px] font-semibold text-ink-soft/60">
          Keep allocation
        </button>
        <button
          type="button"
          disabled={saving || !reason.trim()}
          onClick={submit}
          className="rounded-full bg-red-700 px-2.5 py-1 text-[10.5px] font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Reversing…" : "Confirm reversal"}
        </button>
      </div>
    </div>
  );
}
