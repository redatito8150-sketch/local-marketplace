"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { formatDateTime } from "@/lib/format";

export function AcceptWarehouseRequestButton({ transferId, expectedArrivalAt }: { transferId: string; expectedArrivalAt: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setError(null);
    setOpen(true);
  }

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/warehouse/documents/${transferId}/approve`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Failed to accept the request");
      setOpen(false);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to accept the request");
    } finally {
      setBusy(false);
    }
  }

  return <div className="flex flex-col items-end gap-1.5">
    <button type="button" onClick={openDialog} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#C85956] px-3.5 text-[10.5px] font-extrabold text-white transition-colors hover:bg-[#b94d4a] disabled:opacity-50">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Accept request
    </button>
    {error ? <p role="alert" className="max-w-56 text-right text-[9px] text-red-700">{error}</p> : null}
    {open ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="accept-warehouse-title">
      <div className="w-full max-w-md rounded-[22px] bg-white p-5 text-left shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><h2 id="accept-warehouse-title" className="text-[15px] font-extrabold text-[#302924]">Accept warehouse request?</h2><p className="mt-1 text-[10.5px] leading-4 text-[#756960]">Acceptance confirms that Zakhnook is waiting for the delivery. It does not add stock.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1 text-[#756960] hover:bg-[#f4efeb]"><X className="h-4 w-4" /></button></div>
        <div className="mt-4 rounded-xl bg-[#f6f2ee] px-3 py-2.5"><p className="text-[9px] font-bold uppercase tracking-[0.07em] text-[#8d8076]">Expected arrival chosen by brand</p><p className="mt-1 text-[11px] font-extrabold text-[#403730]">{expectedArrivalAt ? formatDateTime(expectedArrivalAt) : "Not recorded on this legacy request"}</p></div>
        {error ? <p role="alert" className="mt-2 text-[10px] text-red-700">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="h-9 rounded-xl px-3 text-[10.5px] font-bold text-[#655950]">Back</button><button type="button" onClick={accept} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#C85956] px-3.5 text-[10.5px] font-extrabold text-white disabled:opacity-45">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Accept request</button></div>
      </div>
    </div> : null}
  </div>;
}

export function CancelWarehouseRequestButton({ transferId, brandSlug }: { transferId: string; brandSlug?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const query = brandSlug ? `?brand=${encodeURIComponent(brandSlug)}` : "";
      const response = await fetch(`/api/brand-portal/warehouse/transfers/${transferId}/cancel${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Failed to cancel the request");
      setOpen(false);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to cancel the request");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#e2d8d0] bg-white px-3 text-[10.5px] font-bold text-[#655950] hover:bg-[#f7f3ef]">
      <XCircle className="h-3.5 w-3.5" />Cancel request
    </button>
    {open ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="cancel-warehouse-title">
      <div className="w-full max-w-md rounded-[22px] bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><h2 id="cancel-warehouse-title" className="text-[15px] font-extrabold text-[#302924]">Cancel warehouse request?</h2><p className="mt-1 text-[10.5px] leading-4 text-[#756960]">You can cancel only before Zakhnook accepts the request. No stock will be changed.</p></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1 text-[#756960] hover:bg-[#f4efeb]"><X className="h-4 w-4" /></button>
        </div>
        <label className="mt-4 block text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#756960]">Reason
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Why are you cancelling this request?" className="mt-1.5 w-full resize-none rounded-xl bg-[#f6f2ee] px-3 py-2.5 text-[11px] text-[#302924] outline-none ring-[#C85956]/20 focus:ring-2" />
        </label>
        {error ? <p role="alert" className="mt-2 text-[10px] text-red-700">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-xl px-3 text-[10.5px] font-bold text-[#655950]">Keep request</button>
          <button type="button" onClick={cancel} disabled={busy || reason.trim().length < 5} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#C85956] px-3.5 text-[10.5px] font-extrabold text-white disabled:opacity-45">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Cancel request</button>
        </div>
      </div>
    </div> : null}
  </>;
}
