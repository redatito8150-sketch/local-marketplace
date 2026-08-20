"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAppError } from "@/lib/errors/client";
import InlineError from "@/components/shared/InlineError";
import type { AppError } from "@/types";

// Corrective pass 2, Section 1 (docs/audits/2026-08-20-production-security-
// correctness-reliability-audit-en.md): records that an admin has handled
// the refund for this attempt's FAILED bucket money (never a fulfilled
// order's own refund — that goes through RecordOrderRefundAction instead)
// outside this system. No Paymob Refund API call happens anywhere in this
// flow. Amount and provider reference are both required — an optional
// note alone can no longer record anything.
export default function RefundQueueActions({ paymentAttemptId }: { paymentAttemptId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-slate-200 px-3 py-1.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
      >
        Record refund
      </button>
    );
  }

  const amountCents = Math.round(Number(amount) * 100);
  const canSubmit = Number.isFinite(amountCents) && amountCents > 0 && reference.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    const result = await fetchWithAppError(`/api/admin/payments/${paymentAttemptId}/mark-refunded`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents, providerReference: reference.trim(), note: note.trim() || undefined }),
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
    <div className="flex flex-col items-end gap-2">
      <input
        type="number"
        min="0.01"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Refund amount (EGP)"
        className="w-56 rounded-md border border-slate-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-slate-400"
      />
      <input
        type="text"
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder="Paymob refund reference (required)"
        className="w-56 rounded-md border border-slate-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-slate-400"
      />
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="w-56 rounded-md border border-slate-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-slate-400"
      />
      {error && <InlineError error={error} className="w-56" />}
      <div className="flex gap-2">
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
          {saving ? "Saving…" : "Confirm"}
        </button>
      </div>
    </div>
  );
}
