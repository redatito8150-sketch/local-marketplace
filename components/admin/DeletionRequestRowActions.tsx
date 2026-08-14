"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

type PendingAction = "under_review" | "reject" | "approve" | null;
const NONTERMINAL = new Set(["requested", "under_review", "blocked"]);

// Admin's review actions for one deletion request. "Approve" is the only
// action that can permanently delete anything, and it is gated at the
// "admin" staff rank server-side (app/api/admin/products/deletion-requests/
// [id]/approve/route.ts) — a lower-ranked staff member sees the button but
// gets a clear 403 if they try it, same as every other admin-rank-gated
// action in this codebase.
export default function DeletionRequestRowActions({ requestId, status }: { requestId: string; status: string }) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [adminNote, setAdminNote] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pendingAction) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setPendingAction(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, pendingAction]);

  if (!NONTERMINAL.has(status)) return null;

  const open = (action: Exclude<PendingAction, null>) => {
    setError("");
    setAdminNote("");
    setConfirmText("");
    setPendingAction(action);
  };

  const confirm = async () => {
    if (!pendingAction) return;
    setBusy(true);
    setError("");
    try {
      const res = pendingAction === "approve"
        ? await fetch(`/api/admin/products/deletion-requests/${requestId}/approve`, { method: "POST" })
        : await fetch(`/api/admin/products/deletion-requests/${requestId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: pendingAction === "under_review" ? "under_review" : "rejected", adminNote }),
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "That didn't work — please try again.");
        return;
      }
      setPendingAction(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const needsReasonToConfirm = pendingAction === "reject" && !adminNote.trim();
  const needsTypedConfirm = pendingAction === "approve";
  const canConfirm = !busy && !needsReasonToConfirm && (!needsTypedConfirm || confirmText.trim().toUpperCase() === "DELETE");

  return (
    <>
      <div className="flex flex-none flex-wrap gap-2">
        {status !== "under_review" && (
          <button type="button" onClick={() => open("under_review")} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-medium text-slate-700 hover:bg-slate-50">
            Mark under review
          </button>
        )}
        <button type="button" onClick={() => open("reject")} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-medium text-slate-700 hover:bg-slate-50">
          Reject
        </button>
        <button type="button" onClick={() => open("approve")} className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-[11.5px] font-medium text-red-700 hover:bg-red-50">
          Approve deletion
        </button>
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="deletion-request-action-title" aria-describedby="deletion-request-action-description">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close confirmation" onClick={() => !busy && setPendingAction(null)} />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <button type="button" onClick={() => setPendingAction(null)} disabled={busy} aria-label="Close confirmation" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4" aria-hidden="true" /></button>
            <h2 id="deletion-request-action-title" className="pr-9 text-lg font-bold text-slate-900">
              {pendingAction === "under_review" && "Mark this request under review?"}
              {pendingAction === "reject" && "Reject this deletion request?"}
              {pendingAction === "approve" && "Approve permanent deletion?"}
            </h2>
            <p id="deletion-request-action-description" className="mt-2 text-[13px] leading-6 text-slate-600">
              {pendingAction === "under_review" && "Signals to the brand that staff are actively looking at this request."}
              {pendingAction === "reject" && "The product stays archived. The brand can submit a new request later."}
              {pendingAction === "approve" && "The database re-checks eligibility right now — if anything new blocks it (an order, a warehouse receipt, a review), the deletion is refused and the request is marked blocked instead. If it's clear, the product is permanently deleted immediately. This cannot be undone."}
            </p>
            {pendingAction === "reject" && (
              <label className="mt-4 block text-[12px] font-semibold text-slate-700">
                Reason (required)
                <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={2} className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300" />
              </label>
            )}
            {pendingAction === "under_review" && (
              <label className="mt-4 block text-[12px] font-semibold text-slate-700">
                Note (optional)
                <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={2} className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300" />
              </label>
            )}
            {needsTypedConfirm && (
              <label className="mt-4 block text-[12px] font-semibold text-slate-700">
                Type DELETE to confirm
                <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300" />
              </label>
            )}
            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button ref={cancelRef} type="button" onClick={() => setPendingAction(null)} disabled={busy} className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button
                type="button"
                onClick={confirm}
                disabled={!canConfirm}
                className={`h-10 rounded-lg px-4 text-[12.5px] font-semibold text-white disabled:opacity-60 ${pendingAction === "approve" ? "bg-red-700 hover:bg-red-800" : "bg-slate-800 hover:bg-slate-900"}`}
              >
                {busy ? "Working…" : pendingAction === "under_review" ? "Mark under review" : pendingAction === "reject" ? "Reject request" : "Approve & delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
