"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ApplicationDeletePanel({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to delete application");
        return;
      }
      router.push("/admin/applications");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12.5px] font-semibold text-red-600 hover:underline"
      >
        Delete application…
      </button>
    );
  }

  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4">
      <p className="text-[12.5px] font-semibold text-red-700">
        This permanently deletes the application and its documents/history. This cannot be undone.
      </p>
      <label className="mt-3 block text-[12.5px] font-semibold text-slate-700">
        Reason for deletion (kept in the audit log)
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px] font-normal text-slate-900 outline-none focus:border-red-400"
        />
      </label>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={saving || !reason.trim()}
          onClick={handleDelete}
          className="rounded-md bg-red-600 px-4 py-2 text-[12.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Deleting…" : "Confirm delete"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReason("");
            setError("");
          }}
          className="rounded-md border border-slate-200 px-4 py-2 text-[12.5px] font-semibold text-slate-600"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-3 text-[12.5px] font-medium text-red-600">{error}</p>}
    </div>
  );
}
