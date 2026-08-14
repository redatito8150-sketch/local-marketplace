"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, EyeOff, Trash2, X } from "lucide-react";
import type { ProductRecord } from "@/types";

type PendingAction = "archive" | "delete_draft" | "hide" | null;

// Replaces the old generic DeleteEntityButton (a bare confirm() + raw
// `DELETE /api/admin/products/[id]`, which used to hard-delete with no
// dependency checks) for products specifically. Every action here is
// state-aware: a draft can be permanently deleted (it's genuinely
// disposable), a published product can only be archived or emergency-
// hidden, and real permanent deletion of anything with history only ever
// happens through the deletion-requests review queue this component links
// to — never from this row.
export default function AdminProductDeletionActions({ product }: { product: ProductRecord }) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [reason, setReason] = useState("");
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

  const confirm = async () => {
    if (!pendingAction) return;
    setBusy(true);
    setError("");
    try {
      let res: Response;
      if (pendingAction === "hide") {
        res = await fetch(`/api/admin/products/${product.id}/emergency-hide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
      } else {
        res = await fetch("/api/admin/products/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [product.id], action: pendingAction }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data.failed && data.failed.length > 0)) {
        setError(data.error ?? data.failed?.[0]?.message ?? "That didn't work — please try again.");
        return;
      }
      setPendingAction(null);
      setReason("");
      setConfirmText("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const open = (action: Exclude<PendingAction, null>) => {
    setError("");
    setReason("");
    setConfirmText("");
    setPendingAction(action);
  };

  const isDraft = product.status === "draft";
  const isArchived = product.status === "archived";
  const needsTypedConfirm = pendingAction === "delete_draft";
  const canConfirm = !busy && (!needsTypedConfirm || confirmText.trim().toLowerCase() === product.name.trim().toLowerCase()) && (pendingAction !== "hide" || reason.trim().length > 0);

  return (
    <>
      <div className="flex items-center gap-1">
        {!isArchived && (
          <button
            type="button"
            onClick={() => open("archive")}
            aria-label={`Archive ${product.name}`}
            title="Archive — removes from storefront, fully reversible"
            className="rounded-md p-1.5 text-ink-soft/60 transition-colors hover:bg-stone-100 hover:text-ink"
          >
            <Archive className="h-4 w-4" strokeWidth={1.6} />
          </button>
        )}
        {!isDraft && (
          <button
            type="button"
            onClick={() => open("hide")}
            aria-label={`Hide ${product.name} immediately`}
            title="Emergency hide — instant, requires a reason"
            className="rounded-md p-1.5 text-ink-soft/60 transition-colors hover:bg-amber-50 hover:text-amber-700"
          >
            <EyeOff className="h-4 w-4" strokeWidth={1.6} />
          </button>
        )}
        {isDraft && (
          <button
            type="button"
            onClick={() => open("delete_draft")}
            aria-label={`Permanently delete draft ${product.name}`}
            title="Permanently delete this pristine draft"
            className="rounded-md p-1.5 text-ink-soft/60 transition-colors hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.6} />
          </button>
        )}
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="admin-product-action-title" aria-describedby="admin-product-action-description">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close confirmation" onClick={() => !busy && setPendingAction(null)} />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <button type="button" onClick={() => setPendingAction(null)} disabled={busy} aria-label="Close confirmation" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4" aria-hidden="true" /></button>
            <h2 id="admin-product-action-title" className="pr-9 text-lg font-bold text-slate-900">
              {pendingAction === "archive" && `Archive ${product.name}?`}
              {pendingAction === "hide" && `Hide ${product.name} immediately?`}
              {pendingAction === "delete_draft" && `Permanently delete ${product.name}?`}
            </h2>
            <p id="admin-product-action-description" className="mt-2 text-[13px] leading-6 text-slate-600">
              {pendingAction === "archive" && "Removes it from the storefront immediately. Fully reversible — order, review, and inventory history are untouched."}
              {pendingAction === "hide" && "Instantly hides this product from the storefront, even if a deletion request is pending. This is not a deletion — the product stays archived with full history intact. A reason is required and is recorded in the audit log."}
              {pendingAction === "delete_draft" && "This draft has never been published or stocked, so the database allows deleting it immediately. This cannot be undone."}
            </p>
            {pendingAction === "hide" && (
              <label className="mt-4 block text-[12px] font-semibold text-slate-700">
                Reason (required)
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" />
              </label>
            )}
            {needsTypedConfirm && (
              <label className="mt-4 block text-[12px] font-semibold text-slate-700">
                Type <span className="font-bold">{product.name}</span> to confirm
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
                className={`h-10 rounded-lg px-4 text-[12.5px] font-semibold text-white disabled:opacity-60 ${pendingAction === "delete_draft" ? "bg-red-700 hover:bg-red-800" : pendingAction === "hide" ? "bg-amber-600 hover:bg-amber-700" : "bg-slate-800 hover:bg-slate-900"}`}
              >
                {busy ? "Working…" : pendingAction === "archive" ? "Archive" : pendingAction === "hide" ? "Hide now" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
