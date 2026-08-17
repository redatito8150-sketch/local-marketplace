"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Send, Truck, XCircle } from "lucide-react";
import type { WarehouseTransferStatus } from "@/lib/data/warehouse";
import { CONTROL } from "@/components/admin/inventory/shared";

type DestructiveAction = "reject" | "cancel";

export default function WarehouseDocumentActions({ transferId, status }: { transferId: string; status: WarehouseTransferStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [destructiveAction, setDestructiveAction] = useState<DestructiveAction | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const canSubmit = status === "draft";
  const canApprove = status === "pending" || status === "submitted";
  const canMarkInTransit = status === "approved";
  const canReject = ["pending", "submitted", "approved", "in_transit"].includes(status);
  const canCancel = ["draft", "pending", "submitted", "approved"].includes(status);
  if (!canSubmit && !canApprove && !canMarkInTransit && !canReject && !canCancel) return null;

  async function runAction(action: "submit" | "approve" | "in-transit" | DestructiveAction) {
    if ((action === "reject" || action === "cancel") && !reason.trim()) {
      setError("A clear reason is required for this action.");
      return;
    }
    setBusy(action);
    setError("");
    try {
      const path = action === "reject"
        ? `/api/admin/warehouse/transfers/${transferId}/reject`
        : `/api/admin/warehouse/documents/${transferId}/${action}`;
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "reject" || action === "cancel" ? JSON.stringify({ note: reason.trim() }) : undefined,
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "The warehouse document could not be updated");
      setDestructiveAction(null);
      setReason("");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The warehouse document could not be updated");
      setBusy(null);
    }
  }

  return (
    <section aria-label="Document actions" className="rounded-[20px] bg-[#ece7e0] p-4 shadow-[0_12px_32px_rgba(72,50,36,.07)]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto"><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#C85956]">Next action</p><p className="mt-1 text-[10.5px] text-[#756960]">Move this document through the recorded warehouse lifecycle.</p></div>
        {canSubmit ? <ActionButton label="Submit document" action="submit" icon={Send} busy={busy} onClick={runAction} /> : null}
        {canApprove ? <ActionButton label="Approve document" action="approve" icon={CheckCircle2} busy={busy} onClick={runAction} /> : null}
        {canMarkInTransit ? <ActionButton label="Mark in transit" action="in-transit" icon={Truck} busy={busy} onClick={runAction} /> : null}
        {(canReject || canCancel) ? <button type="button" onClick={() => { setDestructiveAction(canReject ? "reject" : "cancel"); setReason(""); setError(""); }} className="inline-flex h-10 items-center rounded-xl bg-[#e2dcd4] px-4 text-[11px] font-bold text-[#62564d] hover:bg-[#d8d0c8] hover:text-red-700"><XCircle className="mr-1.5 h-3.5 w-3.5" />Reject or cancel</button> : null}
      </div>

      {destructiveAction ? (
        <div className="mt-4 rounded-2xl bg-[#f8f4f0] p-4 ring-1 ring-[#ded4cb]">
          <h3 className="text-[12px] font-extrabold text-[#302924]">{destructiveAction === "reject" ? "Reject this warehouse document?" : "Cancel this warehouse document?"}</h3>
          <p className="mt-1 text-[10.5px] leading-5 text-[#756960]">The reason is recorded in the audit trail and shared with the brand. This action does not receive stock.</p>
          <label className="mt-3 block"><span className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#756960]">Required reason</span><textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} rows={2} placeholder="Explain what happened and what the brand should do next…" className={`${CONTROL} mt-1.5 h-auto w-full py-2.5`} /></label>
          {error ? <p role="alert" className="mt-2 flex items-center gap-2 text-[10.5px] font-semibold text-red-700"><AlertCircle className="h-3.5 w-3.5" />{error}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => runAction(destructiveAction)} disabled={busy !== null || !reason.trim()} className="inline-flex h-10 items-center rounded-xl bg-red-700 px-4 text-[11px] font-bold text-white hover:bg-red-800 disabled:opacity-45">{busy === destructiveAction ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}{destructiveAction === "reject" ? "Confirm rejection" : "Confirm cancellation"}</button>{canReject && canCancel ? <button type="button" onClick={() => setDestructiveAction(destructiveAction === "reject" ? "cancel" : "reject")} disabled={busy !== null} className="h-10 rounded-xl px-3 text-[10.5px] font-bold text-[#62564d] hover:bg-[#ece5df]">Use {destructiveAction === "reject" ? "cancel" : "reject"} instead</button> : null}<button type="button" onClick={() => setDestructiveAction(null)} disabled={busy !== null} className="h-10 rounded-xl px-3 text-[10.5px] font-bold text-[#62564d] hover:bg-[#ece5df]">Back</button></div>
        </div>
      ) : error ? <p role="alert" className="mt-3 flex items-center gap-2 text-[10.5px] font-semibold text-red-700"><AlertCircle className="h-3.5 w-3.5" />{error}</p> : null}
    </section>
  );
}

function ActionButton({ label, action, icon: Icon, busy, onClick }: { label: string; action: "submit" | "approve" | "in-transit"; icon: React.ElementType; busy: string | null; onClick: (action: "submit" | "approve" | "in-transit") => void }) {
  return <button type="button" onClick={() => onClick(action)} disabled={busy !== null} className="inline-flex h-10 items-center rounded-xl bg-[#242424] px-4 text-[11px] font-bold text-white hover:bg-[#3a332e] disabled:opacity-50">{busy === action ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Icon className="mr-1.5 h-3.5 w-3.5" />}{label}</button>;
}
