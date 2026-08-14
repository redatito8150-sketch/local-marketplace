"use client";

import Link from "next/link";
import { Lock, LockOpen, ShieldAlert, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ProductDeletionEligibility } from "@/lib/admin/productDeletion";

export default function ArchivedProductRowActions({
  productId,
  productName,
  eligibility,
  audience,
  readOnly = false,
}: {
  productId: string;
  productName: string;
  eligibility: ProductDeletionEligibility;
  audience: "admin" | "brand";
  readOnly?: boolean;
}) {
  const router = useRouter();
  const operationKeyRef = useRef("");
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [holdBusy, setHoldBusy] = useState(false);

  async function permanentlyDelete() {
    setBusy(true);
    setError("");
    try {
      const endpoint = audience === "admin"
        ? `/api/admin/products/${productId}/deletion`
        : `/api/brand-portal/products/${productId}/deletion`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_archived", reason, operationKey: operationKeyRef.current, confirmationName: confirmText }),
      });
      const data = await response.json();
      if (!response.ok) {
        const details = Array.isArray(data.blockers)
          ? data.blockers.map((blocker: { message: string; resolution?: string }) => `${blocker.message} ${blocker.resolution ?? ""}`).join(" ")
          : "";
        setError([data.error, details].filter(Boolean).join(" "));
        return;
      }
      setConfirming(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleHold() {
    if (audience !== "admin") return;
    const holdReason = eligibility.hasActiveHold ? "" : window.prompt("Reason for the legal/admin hold")?.trim();
    if (!eligibility.hasActiveHold && !holdReason) return;
    setHoldBusy(true);
    try {
      const response = await fetch(`/api/admin/products/${productId}/deletion-hold`, {
        method: eligibility.hasActiveHold ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: eligibility.hasActiveHold ? undefined : JSON.stringify({ reason: holdReason }),
      });
      if (response.ok) router.refresh();
    } finally {
      setHoldBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {audience === "admin" && !readOnly && (
          <button type="button" disabled={holdBusy} onClick={toggleHold} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ddd6cd] px-3 text-[11.5px] font-semibold text-[#51473f] hover:bg-[#f7f0e8] disabled:opacity-50">
            {eligibility.hasActiveHold ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {eligibility.hasActiveHold ? "Release hold" : "Apply hold"}
          </button>
        )}
        {eligibility.canDeleteArchived && !readOnly && (
          <button type="button" onClick={() => { operationKeyRef.current = crypto.randomUUID(); setConfirming(true); setConfirmText(""); setReason(""); setError(""); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-700 px-3 text-[11.5px] font-semibold text-white hover:bg-red-800">
            <Trash2 className="h-3.5 w-3.5" /> Delete permanently
          </button>
        )}
      </div>

      {(eligibility.mustRetainHistory || eligibility.hasTemporaryBlockers) && (
        <details className="max-w-xl text-left">
          <summary className="cursor-pointer list-none text-[11.5px] font-semibold text-[#C85956] hover:underline">
            {eligibility.hasTemporaryBlockers
              ? `Resolve ${eligibility.temporaryBlockers.length} blocker${eligibility.temporaryBlockers.length === 1 ? "" : "s"}`
              : "Why this stays Archived"}
          </summary>
          <div className="mt-2 space-y-2 rounded-xl border border-[#e3dcd3] bg-[#fffdf9] p-3">
            {(eligibility.hasTemporaryBlockers ? eligibility.temporaryBlockers : eligibility.immutableReasons).map((blocker) => (
              <div key={blocker.code} className="flex gap-2 text-[11.5px] leading-5 text-[#51473f]">
                <ShieldAlert className="mt-0.5 h-4 w-4 flex-none text-[#C85956]" />
                <div>
                  <p className="font-semibold">{blocker.message}</p>
                  <p className="text-[#75685f]">{blocker.resolution}</p>
                  {blocker.href && <Link href={blocker.href} className="font-semibold text-[#C85956] hover:underline">Open related area</Link>}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-archived-title">
          <button type="button" className="absolute inset-0 bg-slate-900/45" onClick={() => !busy && setConfirming(false)} aria-label="Close" />
          <div className="relative w-full max-w-md rounded-2xl border border-[#e3dcd3] bg-white p-6 shadow-xl">
            <button type="button" onClick={() => setConfirming(false)} className="absolute right-4 top-4 rounded-lg p-2 hover:bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></button>
            <h2 id="delete-archived-title" className="pr-10 text-lg font-bold text-[#242424]">Permanently delete {productName}?</h2>
            <p className="mt-2 text-[13px] leading-6 text-[#75685f]">The latest database check found no permanent history and no current blockers. This action is immediate and cannot be undone.</p>
            <label className="mt-4 block text-[12px] font-semibold">Reason (optional)<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className="mt-1.5 w-full rounded-lg border border-[#ddd6cd] p-2.5" /></label>
            <label className="mt-4 block text-[12px] font-semibold">Type <strong>{productName}</strong> to confirm<input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#ddd6cd] p-2.5" /></label>
            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-[12px] leading-5 text-red-700">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="h-10 rounded-lg border border-[#ddd6cd] px-4 text-[12.5px] font-semibold">Cancel</button>
              <button type="button" onClick={permanentlyDelete} disabled={busy || confirmText !== productName} className="h-10 rounded-lg bg-red-700 px-4 text-[12.5px] font-semibold text-white disabled:opacity-50">{busy ? "Deleting…" : "Delete permanently"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
