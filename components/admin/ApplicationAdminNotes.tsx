"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ApplicationStatus } from "@/types";

// Admin notes are never shown to the applicant or included in any
// applicant-facing email — this PATCH re-sends the current status
// unchanged (the route treats a same-status + adminNotes body as a
// notes-only update, not a transition).
export default function ApplicationAdminNotes({
  applicationId,
  currentStatus,
  initialNotes,
}: {
  applicationId: string;
  currentStatus: ApplicationStatus;
  initialNotes: string;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: currentStatus, adminNotes: notes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to save notes");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        placeholder="Internal notes — never shown to the applicant"
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 outline-none focus:border-mahalyred/40"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md border border-slate-200 px-3.5 py-1.5 text-[12.5px] font-semibold text-slate-700 transition-colors hover:border-mahalyred hover:text-mahalyred disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save notes"}
        </button>
        {error && <span className="text-[12px] font-medium text-red-600">{error}</span>}
      </div>
    </div>
  );
}
