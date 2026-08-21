"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CheckCircle2, Loader2, X } from "lucide-react";
import { formatDateTime } from "@/lib/format";

export default function BrandDeliveryNoteReviewCard({
  transferId,
  note,
  reviewedAt,
  reviewedBy,
}: {
  transferId: string;
  note: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = !reviewedAt;

  async function markDone() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/warehouse/documents/${transferId}/delivery-note-review`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Failed to close the Brand note review");
      setConfirming(false);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to close the Brand note review");
    } finally {
      setBusy(false);
    }
  }

  return <section className={`overflow-hidden rounded-[18px] border ${pending ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {pending ? <AlertTriangle aria-hidden="true" className="h-4 w-4 flex-none text-amber-700" /> : <CheckCircle2 aria-hidden="true" className="h-4 w-4 flex-none text-emerald-700" />}
          <p className="text-[9.5px] font-bold uppercase tracking-[0.07em]">Brand delivery note · {pending ? "Needs review" : "Done"}</p>
        </div>
        <p className="mt-2 text-[11.5px] leading-5">{note}</p>
        {reviewedAt ? <p className="mt-2 text-[9.5px] text-emerald-800">Reviewed {formatDateTime(reviewedAt)}{reviewedBy ? ` by ${reviewedBy}` : ""}. The note remains in the audit trail.</p> : <p className="mt-2 text-[9.5px] text-amber-800">Contact the Brand Owner if needed, then close this follow-up when it has been handled.</p>}
      </div>
      {pending ? <button type="button" onClick={() => { setError(null); setConfirming(true); }} className="inline-flex h-9 flex-none items-center justify-center gap-1.5 rounded-xl bg-[#302924] px-3.5 text-[10.5px] font-extrabold text-white transition-colors hover:bg-[#4a4039] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#302924]/25">
        <Check className="h-3.5 w-3.5" />Mark as done
      </button> : null}
    </div>
    {error ? <p role="alert" className="px-4 pb-3 text-[10px] font-semibold text-red-700">{error}</p> : null}
    {confirming ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="brand-note-review-title">
      <div className="w-full max-w-md rounded-[22px] bg-white p-5 text-left text-[#302924] shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><h2 id="brand-note-review-title" className="text-[15px] font-extrabold">Mark this note as done?</h2><p className="mt-1 text-[10.5px] leading-4 text-[#756960]">This closes the Admin follow-up only. The Stock Return Note stays Returned to brand, and the Brand Owner&apos;s note stays visible in history.</p></div>
          <button type="button" onClick={() => setConfirming(false)} disabled={busy} aria-label="Close" className="rounded-lg p-1 text-[#756960] hover:bg-[#f4efeb]"><X className="h-4 w-4" /></button>
        </div>
        {error ? <p role="alert" className="mt-3 text-[10px] font-semibold text-red-700">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="h-9 rounded-xl px-3 text-[10.5px] font-bold text-[#655950]">Back</button>
          <button type="button" onClick={markDone} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#302924] px-3.5 text-[10.5px] font-extrabold text-white disabled:opacity-45">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Mark as done</button>
        </div>
      </div>
    </div> : null}
  </section>;
}
