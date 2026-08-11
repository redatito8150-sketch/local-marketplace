"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAppError } from "@/lib/errors/client";
import InlineError from "@/components/shared/InlineError";
import type { AppError } from "@/types";

// Records that an admin has handled a refund outside this system (no
// Paymob Refund API call happens anywhere in this flow — see the Phase 3
// report). Guarded server-side against being recorded twice, so two admins
// (or a double-click on a stale screen) can't both "handle" the same
// refund independently.
export default function RefundQueueActions({ paymentAttemptId }: { paymentAttemptId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
        Mark refunded
      </button>
    );
  }

  const submit = async () => {
    setSaving(true);
    setError(null);
    const result = await fetchWithAppError(`/api/admin/payments/${paymentAttemptId}/mark-refunded`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
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
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (e.g. refund reference)"
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
          disabled={saving}
          className="rounded-full bg-mahalyred px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Confirm"}
        </button>
      </div>
    </div>
  );
}
