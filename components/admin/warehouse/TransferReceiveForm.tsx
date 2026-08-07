"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { DashboardPanel, dashboardButtonPrimary, dashboardButtonSecondary } from "@/components/dashboard/DashboardUI";
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
    <DashboardPanel title={isReturn ? "Reconcile return" : "Reconcile receipt"} description="Received + damaged + missing must equal the requested quantity for every item.">
      {error && (
        <div role="alert" className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-5 py-2.5">Item</th>
              <th className="px-5 py-2.5">Requested</th>
              <th className="px-5 py-2.5">{isReturn ? "Returned OK" : "Received OK"}</th>
              <th className="px-5 py-2.5">Damaged</th>
              <th className="px-5 py-2.5">Missing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const row = rows[item.id];
              const total = row.receivedOkQty + row.damagedQty + row.missingQty;
              const balanced = total === item.requestedQty;
              return (
                <tr key={item.id}>
                  <td className="px-5 py-3">
                    <p className="font-semibold text-slate-900">{item.productName}{item.optionLabel ? ` — ${item.optionLabel}` : ""}</p>
                    <code className="text-[11px] text-slate-400">{item.sku}</code>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{item.requestedQty}</td>
                  {(["receivedOkQty", "damagedQty", "missingQty"] as const).map((field) => (
                    <td key={field} className="px-5 py-3">
                      <input
                        type="number"
                        min={0}
                        max={item.requestedQty}
                        step={1}
                        aria-label={`${field} for ${item.productName}`}
                        value={row[field]}
                        onChange={(e) => updateRow(item.id, item.requestedQty, { [field]: Math.max(0, Math.min(item.requestedQty, Math.trunc(Number(e.target.value) || 0))) })}
                        className={`w-20 rounded border px-2 py-1 text-[12.5px] outline-none focus:border-slate-400 ${balanced ? "border-slate-200" : "border-red-300"}`}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 border-t border-slate-100 px-5 py-4">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note (visible to the brand)"
          rows={2}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400"
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => submit("receive")} disabled={submitting !== null} className={dashboardButtonPrimary}>
            {submitting === "receive" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {isReturn ? "Confirm return" : "Confirm receipt"}
          </button>
          <button type="button" onClick={() => submit("reject")} disabled={submitting !== null} className={dashboardButtonSecondary}>
            {submitting === "reject" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Reject request
          </button>
        </div>
      </div>
    </DashboardPanel>
  );
}
