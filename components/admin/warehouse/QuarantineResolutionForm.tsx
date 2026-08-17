"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { CONTROL } from "@/components/admin/inventory/shared";

type Resolution = "written_off" | "returned_to_brand" | "restored_to_sellable";

export default function QuarantineResolutionForm({ transferItemId, quantity, sku }: { transferItemId: string; quantity: number; sku: string }) {
  const router = useRouter();
  const operationKey = useRef(crypto.randomUUID());
  const [resolution, setResolution] = useState<Resolution | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!resolution || !note.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/warehouse/quarantine/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": operationKey.current,
        },
        body: JSON.stringify({ transferItemId, resolution, note: note.trim() }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Failed to resolve this discrepancy");
      operationKey.current = crypto.randomUUID();
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to resolve this discrepancy");
      setBusy(false);
    }
  }

  return (
    <details className="group mt-3 rounded-xl bg-amber-50/70 p-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[10.5px] font-extrabold text-amber-900 outline-none focus-visible:ring-2 focus-visible:ring-amber-700/25 [&::-webkit-details-marker]:hidden"><ShieldCheck className="h-3.5 w-3.5" />Resolve {quantity} quarantined {quantity === 1 ? "unit" : "units"}</summary>
      <div className="mt-3 grid gap-2 lg:grid-cols-[220px_1fr_auto] lg:items-end">
        <label><span className="text-[9px] font-bold uppercase tracking-[0.07em] text-amber-900">Resolution</span><select value={resolution} onChange={(event) => setResolution(event.target.value as Resolution | "")} className={`${CONTROL} mt-1 w-full bg-white`}><option value="">Choose a resolution…</option><option value="written_off">Write off</option><option value="returned_to_brand">Return to brand</option><option value="restored_to_sellable">Restore to sellable stock</option></select></label>
        <label><span className="text-[9px] font-bold uppercase tracking-[0.07em] text-amber-900">Required audit note</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder={`Inspection result for ${sku}…`} className={`${CONTROL} mt-1 w-full bg-white`} /></label>
        <button type="button" onClick={submit} disabled={!resolution || !note.trim() || busy} className="inline-flex h-11 items-center justify-center rounded-xl bg-amber-800 px-4 text-[11px] font-bold text-white hover:bg-amber-900 disabled:opacity-45">{busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}Confirm resolution</button>
      </div>
      <p className="mt-2 text-[9.5px] leading-4 text-amber-900/80">Restoring to sellable stock increases live inventory. Returning to brand moves the units out of Zakhnook quarantine. Write-off records disposal without adding stock.</p>
      {error ? <p role="alert" className="mt-2 flex items-center gap-2 text-[10.5px] font-semibold text-red-700"><AlertCircle className="h-3.5 w-3.5" />{error}</p> : null}
    </details>
  );
}
