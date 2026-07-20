"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReviewDecisionActions({ productId }: { productId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState("");

  const decide = async (decision: "approve" | "request_changes") => {
    // First click on "Request Changes" just reveals the notes field —
    // approval reasoning doesn't need one, but a rejection always should.
    if (decision === "request_changes" && !showNotes) {
      setShowNotes(true);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/products/${productId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes }),
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
    <div className="flex flex-none flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => decide("approve")}
          className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-semibold text-cream transition-transform hover:scale-[1.02] disabled:opacity-60"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide("request_changes")}
          className="rounded-md border border-stone-150 bg-white px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-stone-50 disabled:opacity-60"
        >
          Request Changes
        </button>
      </div>
      {showNotes && (
        <div className="flex w-64 flex-col items-end gap-1.5">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What needs to change before this can be approved?"
            rows={2}
            className="w-full rounded-md border border-stone-150 px-2.5 py-1.5 text-[12.5px] focus:border-ink/30 focus:outline-none"
          />
          <button
            type="button"
            disabled={busy || !notes.trim()}
            onClick={() => decide("request_changes")}
            className="rounded-md border border-red-100 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
