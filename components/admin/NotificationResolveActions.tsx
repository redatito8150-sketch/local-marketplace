"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Undo2 } from "lucide-react";

// Instant-Publish: shown only on a notification whose brand-initiated
// product change already went live and is still awaiting a decision.
// "Approve" is a no-op acknowledgement; "Revert" undoes the change via
// the linked audit log entry (see /api/admin/notifications/[id]/resolve).
export default function NotificationResolveActions({ notificationId }: { notificationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "revert" | null>(null);
  const [error, setError] = useState("");

  const resolve = async (decision: "approve" | "revert") => {
    if (decision === "revert" && !window.confirm("Revert this change back to how it was?")) {
      return;
    }
    setBusy(decision);
    setError("");
    try {
      const res = await fetch(`/api/admin/notifications/${notificationId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setBusy(null);
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => resolve("approve")}
          className="flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-[12px] font-semibold text-cream transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2} />
          {busy === "approve" ? "…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => resolve("revert")}
          className="flex items-center gap-1.5 rounded-md border border-stone-150 px-3 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Undo2 className="h-3.5 w-3.5" strokeWidth={2} />
          {busy === "revert" ? "…" : "Revert"}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
