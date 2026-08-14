"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, RotateCcw, Trash2, Unlock, X } from "lucide-react";

type PendingAction = "restore" | "schedule_delete" | "cancel_schedule" | "apply_hold" | "release_hold" | null;

interface Props {
  productId: string;
  productName: string;
  canRestore: boolean;
  canScheduleDeletion: boolean;
  hasActiveSchedule: boolean;
  hasActiveHold: boolean;
}

// Admin's Retired-tab actions. Ordinary permanent deletion no longer waits
// on admin approval — scheduling one here follows exactly the same
// canonical, eligibility-checked RPC the Brand Portal uses. The only
// admin-specific action here is the Legal/Admin Hold, which blocks
// immediate deletion, scheduling, and execution of an existing schedule
// while active (supabase/migrations/20260814020000_product_deletion_lifecycle.sql).
export default function RetiredProductRowActions({ productId, productName, canRestore, canScheduleDeletion, hasActiveSchedule, hasActiveHold }: Props) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const scheduleIdempotencyKeyRef = useRef<string>("");

  useEffect(() => {
    if (!pendingAction) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setPendingAction(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, pendingAction]);

  const open = (action: Exclude<PendingAction, null>) => {
    setError("");
    setReason("");
    setConfirmText("");
    if (action === "schedule_delete") scheduleIdempotencyKeyRef.current = crypto.randomUUID();
    setPendingAction(action);
  };

  const confirm = async () => {
    if (!pendingAction) return;
    setBusy(true);
    setError("");
    try {
      let res: Response;
      if (pendingAction === "restore") {
        res = await fetch(`/api/admin/products/${productId}/restore`, { method: "POST" });
      } else if (pendingAction === "apply_hold") {
        res = await fetch(`/api/admin/products/${productId}/deletion-hold`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
        });
      } else if (pendingAction === "release_hold") {
        res = await fetch(`/api/admin/products/${productId}/deletion-hold`, { method: "DELETE" });
      } else if (pendingAction === "schedule_delete") {
        res = await fetch(`/api/admin/products/${productId}/deletion-schedule`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": scheduleIdempotencyKeyRef.current },
          body: JSON.stringify({ reason }),
        });
      } else {
        res = await fetch(`/api/admin/products/${productId}/deletion-schedule`, { method: "DELETE" });
      }
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

  const needsTypedConfirm = pendingAction === "schedule_delete";
  const needsReason = pendingAction === "apply_hold";
  const canConfirm = !busy
    && (!needsTypedConfirm || confirmText.trim().toLowerCase() === productName.trim().toLowerCase())
    && (!needsReason || reason.trim().length > 0);

  const copy: Record<Exclude<PendingAction, null>, { title: string; body: string; confirmLabel: string; tone: "neutral" | "danger" }> = {
    restore: { title: `Restore ${productName}?`, body: "Brings this product back as a Draft. Publish it again from the editor once it's ready.", confirmLabel: "Restore to Draft", tone: "neutral" },
    schedule_delete: { title: `Schedule permanent deletion of ${productName}?`, body: "This product will be permanently deleted in 7 days unless cancelled first or new activity blocks it. Type the product name to confirm.", confirmLabel: "Schedule deletion", tone: "danger" },
    cancel_schedule: { title: "Cancel this scheduled deletion?", body: "The product stays retired. It can be scheduled for deletion again later.", confirmLabel: "Cancel scheduled deletion", tone: "neutral" },
    apply_hold: { title: `Apply a legal/admin hold to ${productName}?`, body: "Blocks immediate deletion, scheduling, and execution of any existing schedule until the hold is released. A reason is required and is recorded in the audit log.", confirmLabel: "Apply hold", tone: "danger" },
    release_hold: { title: `Release the hold on ${productName}?`, body: "Deletion becomes available again, but nothing is scheduled automatically — schedule it again explicitly if needed.", confirmLabel: "Release hold", tone: "neutral" },
  };

  return (
    <>
      <div className="flex items-center gap-1">
        {canRestore && (
          <button type="button" onClick={() => open("restore")} aria-label={`Restore ${productName}`} title="Restore to Draft" className="rounded-md p-1.5 text-ink-soft/60 transition-colors hover:bg-emerald-50 hover:text-emerald-700">
            <RotateCcw className="h-4 w-4" strokeWidth={1.6} />
          </button>
        )}
        {hasActiveHold ? (
          <button type="button" onClick={() => open("release_hold")} aria-label={`Release hold on ${productName}`} title="Release legal/admin hold" className="rounded-md p-1.5 text-ink-soft/60 transition-colors hover:bg-emerald-50 hover:text-emerald-700">
            <Unlock className="h-4 w-4" strokeWidth={1.6} />
          </button>
        ) : (
          <button type="button" onClick={() => open("apply_hold")} aria-label={`Apply hold to ${productName}`} title="Apply legal/admin hold" className="rounded-md p-1.5 text-ink-soft/60 transition-colors hover:bg-amber-50 hover:text-amber-700">
            <Lock className="h-4 w-4" strokeWidth={1.6} />
          </button>
        )}
        {hasActiveSchedule ? (
          <button type="button" onClick={() => open("cancel_schedule")} aria-label={`Cancel scheduled deletion of ${productName}`} title="Cancel scheduled deletion" className="rounded-md p-1.5 text-ink-soft/60 transition-colors hover:bg-slate-100 hover:text-ink">
            <Trash2 className="h-4 w-4" strokeWidth={1.6} />
          </button>
        ) : canScheduleDeletion && !hasActiveHold ? (
          <button type="button" onClick={() => open("schedule_delete")} aria-label={`Schedule permanent deletion of ${productName}`} title="Schedule permanent deletion" className="rounded-md p-1.5 text-ink-soft/60 transition-colors hover:bg-red-50 hover:text-red-700">
            <Trash2 className="h-4 w-4" strokeWidth={1.6} />
          </button>
        ) : null}
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="retired-row-action-title" aria-describedby="retired-row-action-description">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close confirmation" onClick={() => !busy && setPendingAction(null)} />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <button type="button" onClick={() => setPendingAction(null)} disabled={busy} aria-label="Close confirmation" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4" aria-hidden="true" /></button>
            <h2 id="retired-row-action-title" className="pr-9 text-lg font-bold text-slate-900">{copy[pendingAction].title}</h2>
            <p id="retired-row-action-description" className="mt-2 text-[13px] leading-6 text-slate-600">{copy[pendingAction].body}</p>
            {needsReason && (
              <label className="mt-4 block text-[12px] font-semibold text-slate-700">
                Reason (required)
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" />
              </label>
            )}
            {needsTypedConfirm && (
              <label className="mt-4 block text-[12px] font-semibold text-slate-700">
                Type <span className="font-bold">{productName}</span> to confirm
                <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300" />
              </label>
            )}
            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button ref={cancelRef} type="button" onClick={() => setPendingAction(null)} disabled={busy} className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={confirm} disabled={!canConfirm} className={`h-10 rounded-lg px-4 text-[12.5px] font-semibold text-white disabled:opacity-60 ${copy[pendingAction].tone === "danger" ? "bg-red-700 hover:bg-red-800" : "bg-slate-800 hover:bg-slate-900"}`}>
                {busy ? "Working…" : copy[pendingAction].confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
