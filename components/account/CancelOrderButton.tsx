"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function CancelOrderButton({ masterOrderId }: { masterOrderId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const cancelOrder = async () => {
    setSubmitting(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`/api/account/orders/${masterOrderId}/cancel`, {
      method: "POST",
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "We couldn't cancel this order.");
      setSubmitting(false);
      return;
    }
    setConfirming(false);
    setSubmitting(false);
    router.refresh();
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-[12.5px] font-semibold text-[var(--account-danger)] hover:underline"
      >
        Cancel order
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-[var(--account-danger)]/20 bg-[color-mix(in_srgb,var(--account-danger)_7%,transparent)] p-3">
      <p className="text-[12.5px] text-[var(--account-text)]">Cancel this purchase and return its reserved stock?</p>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" disabled={submitting} onClick={cancelOrder} className="rounded-full bg-[var(--account-danger)] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60">
          {submitting ? "Cancelling…" : "Yes, cancel"}
        </button>
        <button type="button" disabled={submitting} onClick={() => setConfirming(false)} className="text-[12px] font-semibold text-[var(--account-text-muted)]">
          Keep order
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-[12px] text-[var(--account-danger)]">{error}</p>}
    </div>
  );
}
