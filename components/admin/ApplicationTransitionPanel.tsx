"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ALLOWED_STATUS_TRANSITIONS } from "@/lib/join/constants";
import { APPLICATION_STATUS_LABELS } from "@/lib/admin/statuses";
import type { ApplicationStatus } from "@/types";

// Transitions an admin can trigger from this panel — deliberately narrower
// than the full ALLOWED_STATUS_TRANSITIONS map: "withdrawn" is
// applicant-only, and "converted_to_brand" only ever happens through the
// Approve → Create Brand flow (Milestone 6), never a bare status flip.
const ADMIN_ACTIONABLE: ApplicationStatus[] = [
  "under_review",
  "changes_requested",
  "approved",
  "approved_pending_creation",
  "rejected",
];

const REASON_REQUIRED: ApplicationStatus[] = ["changes_requested", "rejected"];

export default function ApplicationTransitionPanel({
  applicationId,
  currentStatus,
}: {
  applicationId: string;
  currentStatus: ApplicationStatus;
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<ApplicationStatus | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const nextOptions = (ALLOWED_STATUS_TRANSITIONS[currentStatus] ?? []).filter((s) =>
    ADMIN_ACTIONABLE.includes(s)
  );

  async function applyTransition(status: ApplicationStatus, reasonText: string) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason: reasonText || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to update status");
        return;
      }
      setPendingAction(null);
      setReason("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function handleClick(status: ApplicationStatus) {
    if (REASON_REQUIRED.includes(status)) {
      setPendingAction(status);
      return;
    }
    applyTransition(status, "");
  }

  if (nextOptions.length === 0) {
    return (
      <p className="text-[13px] text-slate-500">
        No further status changes are available from &quot;{APPLICATION_STATUS_LABELS[currentStatus]}&quot;.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {nextOptions.map((status) => (
          <button
            key={status}
            type="button"
            disabled={saving}
            onClick={() => handleClick(status)}
            className="rounded-md border border-slate-200 px-3.5 py-2 text-[12.5px] font-semibold text-slate-700 transition-colors hover:border-mahalyred hover:text-mahalyred disabled:cursor-not-allowed disabled:opacity-60"
          >
            {APPLICATION_STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      {pendingAction && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
          <label className="block text-[12.5px] font-semibold text-slate-700">
            Reason for {APPLICATION_STATUS_LABELS[pendingAction]} (shown to the applicant)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 outline-none focus:border-mahalyred/40"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={saving || !reason.trim()}
              onClick={() => applyTransition(pendingAction, reason.trim())}
              className="rounded-md bg-mahalyred px-4 py-2 text-[12.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingAction(null);
                setReason("");
              }}
              className="rounded-md border border-slate-200 px-4 py-2 text-[12.5px] font-semibold text-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-[12.5px] font-medium text-red-600">{error}</p>}
    </div>
  );
}
