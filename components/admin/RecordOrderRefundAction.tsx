"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAppError } from "@/lib/errors/client";
import InlineError from "@/components/shared/InlineError";
import type { AppError } from "@/types";

// This action creates a pending operational request only. It never marks
// money as refunded and can never unlock cancellation. The order changes
// only after verified provider reconciliation supplies an exact confirmed
// amount and the database matches it to this request.
export default function RecordOrderRefundAction({
  orderId,
  paymentStatus,
  pendingAmountCents,
}: {
  orderId: string;
  paymentStatus: "unpaid" | "paid" | "partially_refunded" | "refunded";
  pendingAmountCents: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  if (paymentStatus === "refunded") {
    return <p className="text-[12px] font-medium text-ink-soft/60">Fully refunded.</p>;
  }

  if (pendingAmountCents > 0) {
    return (
      <p className="text-[12px] font-medium text-amber-700">
        Refund requested — waiting for Paymob confirmation.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-slate-200 px-3 py-1.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
      >
        {paymentStatus === "partially_refunded" ? "Request another refund" : "Request refund"}
      </button>
    );
  }

  const amountCents = Math.round(Number(amount) * 100);
  const canSubmit = Number.isFinite(amountCents) && amountCents > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    const result = await fetchWithAppError(`/api/admin/orders/${orderId}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents, note: note.trim() || undefined }),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-[11px] font-semibold text-ink-soft/70">
        Refund amount (EGP)
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-slate-400"
        />
      </label>
      <label className="text-[11px] font-semibold text-ink-soft/70">
        Note (optional)
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-slate-400"
        />
      </label>
      {error && <InlineError error={error} />}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full border border-slate-200 px-3 py-1.5 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={saving || !canSubmit}
          className="rounded-full bg-mahalyred px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Request refund"}
        </button>
      </div>
    </div>
  );
}
