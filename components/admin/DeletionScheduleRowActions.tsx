"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

// The only action available from this operational history page: cancel an
// active schedule. There is no "approve" — ordinary deletion is
// database-authoritative and automatic, never waiting on a human. Gated
// server-side by requireStaffRole inside the DELETE route itself;
// `canCancel` here (computed from the viewer's own rank in the parent
// page) just keeps the button from being offered to a "staff"-rank viewer
// who would only get a 403 clicking it.
export default function DeletionScheduleRowActions({ productId, status, canCancel }: { productId: string | null; status: string; canCancel: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, open]);

  if (status !== "scheduled" || !productId || !canCancel) return null;

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/products/${productId}/deletion-schedule`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "That didn't work — please try again.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-none">
        <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-medium text-slate-700 hover:bg-slate-50">
          Cancel schedule
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-schedule-title" aria-describedby="cancel-schedule-description">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close confirmation" onClick={() => !busy && setOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <button type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="Close confirmation" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4" aria-hidden="true" /></button>
            <h2 id="cancel-schedule-title" className="pr-9 text-lg font-bold text-slate-900">Cancel this scheduled deletion?</h2>
            <p id="cancel-schedule-description" className="mt-2 text-[13px] leading-6 text-slate-600">The product stays retired. It can be scheduled for deletion again later.</p>
            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button ref={cancelRef} type="button" onClick={() => setOpen(false)} disabled={busy} className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Keep schedule</button>
              <button type="button" onClick={confirm} disabled={busy} className="h-10 rounded-lg bg-slate-800 px-4 text-[12.5px] font-semibold text-white hover:bg-slate-900 disabled:opacity-60">
                {busy ? "Working…" : "Cancel scheduled deletion"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
