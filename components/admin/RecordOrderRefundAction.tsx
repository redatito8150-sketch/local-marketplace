"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAppError } from "@/lib/errors/client";
import InlineError from "@/components/shared/InlineError";
import type { AppError } from "@/types";

// Corrective pass 2, Section 1 (docs/audits/2026-08-20-production-security-
// correctness-reliability-audit-en.md): replaces the old "mark refunded"
// note-only flow for a specific card order. Amount and provider reference
// are both required — the server (record_order_refund) is the actual
// source of truth for whether this exceeds what's refundable, this is
// just matching input shape to what it needs.
export default function RecordOrderRefundAction({
  orderId,
  paymentStatus,
}: {
  orderId: string;
  paymentStatus: "unpaid" | "paid" | "partially_refunded" | "refunded";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  if (paymentStatus === "refunded") {
    return <p className="text-[12px] font-medium text-ink-soft/60">Fully refunded.</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-slate-200 px-3 py-1.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
      >
        {paymentStatus === "partially_refunded" ? "Record another refund" : "Record refund"}
      </button>
    );
  }

  const amountCents = Math.round(Number(amount) * 100);
  const canSubmit = Number.isFinite(amountCents) && amountCents > 0 && reference.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    const result = await fetchWithAppError(`/api/admin/orders/${orderId}/refund`, {
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
        Paymob refund reference
        <input
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Required — from Paymob's dashboard"
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
          {saving ? "Saving…" : "Confirm refund"}
        </button>
      </div>
    </div>
  );
}
