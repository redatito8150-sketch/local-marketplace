"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { fetchWithAppError } from "@/lib/errors/client";
import type { AppError } from "@/types";

const NEXT_STATUS: Record<string, { target: string; label: string }> = {
  confirmed: { target: "preparing", label: "Accept & start preparing" },
  pending: { target: "preparing", label: "Accept & start preparing" },
  paid: { target: "preparing", label: "Accept & start preparing" },
  preparing: { target: "ready_for_pickup", label: "Ready for pickup" },
};

export default function BrandOrderStatusControl({
  orderId,
  status,
  brandSlug,
}: {
  orderId: string;
  status: string;
  brandSlug: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [showCannotFulfill, setShowCannotFulfill] = useState(false);
  const [reason, setReason] = useState("");
  const next = NEXT_STATUS[status];
  if (!next) return null;

  const advance = async () => {
    setSubmitting(true);
    setError(null);
    const result = await fetchWithAppError(`/api/brand-portal/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next.target, brandSlug }),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  const cannotFulfill = async () => {
    if (reason.trim().length < 5) return;
    setSubmitting(true);
    setError(null);
    const result = await fetchWithAppError(`/api/brand-portal/orders/${orderId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandSlug, reason: reason.trim() }),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setShowCannotFulfill(false);
    router.refresh();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={advance}
          disabled={submitting}
          className="rounded-full border border-[#242424]/15 bg-white px-3 py-1.5 text-[10.5px] font-bold text-[#242424] transition-colors hover:bg-[#242424]/5 disabled:opacity-60"
        >
          {submitting ? "Working…" : next.label}
        </button>
        <button
          type="button"
          onClick={() => setShowCannotFulfill((open) => !open)}
          disabled={submitting}
          className="rounded-full px-3 py-1.5 text-[10.5px] font-bold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60"
        >
          Cannot fulfill
        </button>
      </div>
      {showCannotFulfill && (
        <div className="mt-3 rounded-xl border border-red-100 bg-white p-3">
          <label htmlFor={`cannot-fulfill-${orderId}`} className="text-[10.5px] font-bold text-[#403730]">
            Why can&apos;t you fulfill this order?
          </label>
          <textarea
            id={`cannot-fulfill-${orderId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Tell Zakhnook and the customer what happened."
            className="mt-2 w-full resize-none rounded-lg border border-[#e7ddd5] px-3 py-2 text-[11px] outline-none focus:border-[#C85956]"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowCannotFulfill(false)} className="px-3 py-1.5 text-[10.5px] font-bold text-[#71645b]">Keep order</button>
            <button type="button" onClick={cannotFulfill} disabled={submitting || reason.trim().length < 5} className="rounded-lg bg-red-700 px-3 py-1.5 text-[10.5px] font-bold text-white disabled:opacity-40">Cancel & restore stock</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-[10.5px] text-red-600">{error.userMessage}</p>}
    </div>
  );
}
