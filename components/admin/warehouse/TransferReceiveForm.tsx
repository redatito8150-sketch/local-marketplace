"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { VariantIdentity, CONTROL } from "@/components/admin/inventory/shared";
import type { WarehouseTransferItemRow } from "@/lib/data/warehouse";

type Row = { receivedOkQty: number; damagedQty: number; missingQty: number; itemNote: string };

export default function TransferReceiveForm({ transferId, items, isReturn = false }: { transferId: string; items: WarehouseTransferItemRow[]; isReturn?: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, Row>>(
    Object.fromEntries(items.map((item) => [item.id, { receivedOkQty: item.requestedQty, damagedQty: 0, missingQty: 0, itemNote: "" }]))
  );
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState<"receive" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateRow = (itemId: string, requestedQty: number, patch: Partial<Row>) => {
    setRows((prev) => {
      const current = { ...prev[itemId], ...patch };
      // Keep the three counts reconciled to the requested total automatically
      // whenever one of them changes — the admin only has to correct the
      // one(s) that actually differ from a clean full receipt.
      if (patch.receivedOkQty !== undefined) {
        const remaining = Math.max(0, requestedQty - patch.receivedOkQty);
        current.damagedQty = Math.min(current.damagedQty, remaining);
        current.missingQty = Math.max(0, remaining - current.damagedQty);
      } else if (patch.damagedQty !== undefined || patch.missingQty !== undefined) {
        current.receivedOkQty = Math.max(0, requestedQty - current.damagedQty - current.missingQty);
      }
      return { ...prev, [itemId]: current };
    });
  };

  async function submit(action: "receive" | "reject") {
    setSubmitting(action);
    setError(null);
    try {
      const body =
        action === "receive"
          ? { items: items.map((item) => ({ itemId: item.id, ...rows[item.id] })), note: note.trim() || undefined }
          : { note: note.trim() || undefined };
      const res = await fetch(`/api/admin/warehouse/transfers/${transferId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      router.push("/admin/warehouse");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setSubmitting(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-[22px] border-0 bg-[#ece7e0] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
      <header className="border-b border-[#eee7e1] px-5 py-4">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#C85956]">{isReturn ? "Reconcile return" : "Reconcile receipt"}</p>
        <h2 className="mt-1 text-[14px] font-extrabold text-[#302924]">Received + damaged + missing must equal the requested quantity for every item.</h2>
      </header>
      {error && (
        <div role="alert" className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      <div className="divide-y divide-[#eee7e1]">
        {items.map((item) => {
          const row = rows[item.id];
          const total = row.receivedOkQty + row.damagedQty + row.missingQty;
          const balanced = total === item.requestedQty;
          return (
            <div key={item.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <VariantIdentity image={item.productImage} productName={item.productName} label={`${item.productName}${item.optionLabel ? ` — ${item.optionLabel}` : ""}`} sku={item.sku} />
              <span className="text-[11px] font-bold text-[#8d8076]">Requested {item.requestedQty}</span>
              <div className="ml-auto flex flex-wrap items-end gap-3">
                {(["receivedOkQty", "damagedQty", "missingQty"] as const).map((field) => (
                  <label key={field} className="flex flex-col gap-1">
                    <span className="text-[8.5px] font-bold uppercase tracking-[0.07em] text-[#9a8c82]">{field === "receivedOkQty" ? (isReturn ? "Returned OK" : "Received OK") : field === "damagedQty" ? "Damaged" : "Missing"}</span>
                    <input
                      type="number"
                      min={0}
                      max={item.requestedQty}
                      step={1}
                      aria-label={`${field} for ${item.productName}`}
                      value={row[field]}
                      onChange={(e) => updateRow(item.id, item.requestedQty, { [field]: Math.max(0, Math.min(item.requestedQty, Math.trunc(Number(e.target.value) || 0))) })}
                      className={`h-10 w-20 rounded-lg border-0 px-2 text-[12.5px] font-bold outline-none ring-1 ${balanced ? "bg-[#f7f3ef] ring-[#e6dbd3]" : "bg-red-50 ring-red-200"} focus-visible:ring-2 focus-visible:ring-[#C85956]/30`}
                    />
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="space-y-3 border-t border-[#eee7e1] px-5 py-4">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note (visible to the brand)"
          rows={2}
          className={`${CONTROL} h-auto w-full py-2.5`}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => submit("receive")} disabled={submitting !== null} className="inline-flex h-11 items-center rounded-xl bg-[#C85956] px-5 text-[12px] font-bold text-white transition-colors hover:bg-[#b84e4b] disabled:opacity-60">
            {submitting === "receive" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {isReturn ? "Confirm return" : "Confirm receipt"}
          </button>
          <button type="button" onClick={() => submit("reject")} disabled={submitting !== null} className="inline-flex h-11 items-center rounded-xl border border-[#e6dbd3] bg-transparent px-5 text-[12px] font-bold text-[#62564d] transition-colors hover:text-[#C85956] disabled:opacity-60">
            {submitting === "reject" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Reject request
          </button>
        </div>
      </div>
    </section>
  );
}
