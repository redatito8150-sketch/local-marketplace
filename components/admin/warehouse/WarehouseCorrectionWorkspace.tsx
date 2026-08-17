"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeftRight, CheckCircle2, FilePenLine, Loader2, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { CONTROL, formatCount, titleCase } from "@/components/admin/inventory/shared";
import type { WarehouseCorrectionRow, WarehouseReceiptRow, WarehouseReceiptVariantOption } from "@/lib/data/warehouse";

type Action = "reclassify" | "adjust_in" | "adjust_out" | "restore_to_sellable" | "return_to_brand" | "write_off" | "accept_discrepancy";
type SourceBucket = "damaged" | "missing" | "substitution" | "excess" | "unidentified";

const ACTION_META: Record<Action, { label: string; type: string; reason: string }> = {
  reclassify: { label: "Wrong Variant — move stock to the correct Variant", type: "reclassification", reason: "wrong_variant" },
  adjust_in: { label: "Missing stock found / positive count correction", type: "missing_recovery", reason: "missing_found" },
  adjust_out: { label: "Count error / duplicate receipt", type: "quantity_adjustment", reason: "count_error" },
  restore_to_sellable: { label: "Damaged stock regraded as sellable", type: "condition_resolution", reason: "damage_regraded" },
  return_to_brand: { label: "Return held stock to the brand", type: "condition_resolution", reason: "return_to_brand" },
  write_off: { label: "Write off held stock", type: "condition_resolution", reason: "write_off" },
  accept_discrepancy: { label: "Accept a documented discrepancy — no stock movement", type: "condition_resolution", reason: "other" },
};

export default function WarehouseCorrectionWorkspace({
  transferId,
  variants,
  corrections,
  receipts,
}: {
  transferId: string;
  variants: WarehouseReceiptVariantOption[];
  corrections: WarehouseCorrectionRow[];
  receipts: WarehouseReceiptRow[];
}) {
  const router = useRouter();
  const operationKey = useRef(crypto.randomUUID());
  const reversalOperationKey = useRef(crypto.randomUUID());
  const [action, setAction] = useState<Action>("reclassify");
  const [fromVariantId, setFromVariantId] = useState(variants[0]?.variantId ?? "");
  const [toVariantId, setToVariantId] = useState(variants[1]?.variantId ?? variants[0]?.variantId ?? "");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [sourceReceiptLineId, setSourceReceiptLineId] = useState("");
  const [sourceBucket, setSourceBucket] = useState<SourceBucket | "">("");
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [reversing, setReversing] = useState<string | null>(null);
  const [reversalNote, setReversalNote] = useState("");
  const [error, setError] = useState("");

  const needsFrom = ["reclassify", "adjust_out", "return_to_brand", "write_off"].includes(action);
  const needsTo = ["reclassify", "adjust_in", "restore_to_sellable"].includes(action);
  const needsDamageSource = ["restore_to_sellable", "return_to_brand", "write_off"].includes(action);
  const requiresSource = needsDamageSource || action === "accept_discrepancy";
  const discrepancySources = useMemo(() => receipts.flatMap((receipt) => receipt.lines.flatMap((line) => {
    const options: Array<{ receiptNumber: string; line: typeof line; bucket: SourceBucket; quantity: number }> = [];
    if (line.actualDamagedQty > 0) options.push({ receiptNumber: receipt.receiptNumber, line, bucket: "damaged", quantity: line.actualDamagedQty });
    if (line.expectedMissingQty > 0) options.push({ receiptNumber: receipt.receiptNumber, line, bucket: "missing", quantity: line.expectedMissingQty });
    if (line.actualVariantId && line.actualVariantId !== line.expectedVariantId && line.actualGoodQty > 0) options.push({ receiptNumber: receipt.receiptNumber, line, bucket: "substitution", quantity: line.actualGoodQty });
    if (line.actualExcessQty > 0) options.push({ receiptNumber: receipt.receiptNumber, line, bucket: "excess", quantity: line.actualExcessQty });
    if (line.unidentifiedQty > 0) options.push({ receiptNumber: receipt.receiptNumber, line, bucket: "unidentified", quantity: line.unidentifiedQty });
    return options;
  })).filter((source) => {
    if (needsDamageSource) return source.bucket === "damaged";
    if (action === "accept_discrepancy") return ["missing", "substitution", "excess"].includes(source.bucket);
    if (action === "reclassify") return source.bucket === "substitution";
    if (action === "adjust_in") return ["missing", "unidentified"].includes(source.bucket);
    if (action === "adjust_out") return source.bucket === "excess";
    return false;
  }), [action, needsDamageSource, receipts]);
  const valid = quantity > 0
    && Number.isInteger(quantity)
    && reason.trim().length >= 5
    && (!needsFrom || Boolean(fromVariantId))
    && (!needsTo || Boolean(toVariantId))
    && (!requiresSource || Boolean(sourceReceiptLineId && sourceBucket))
    && (action !== "reclassify" || fromVariantId !== toVariantId);

  const variantLabel = useMemo(() => new Map(variants.map((variant) => [variant.variantId, `${variant.productName}${variant.optionLabel ? ` — ${variant.optionLabel}` : ""} · ${variant.sku}`])), [variants]);

  function chooseSource(value: string) {
    const [receiptLineId, bucketValue] = value.split(":") as [string, SourceBucket | undefined];
    setSourceReceiptLineId(receiptLineId ?? "");
    setSourceBucket(bucketValue ?? "");
    const source = discrepancySources.find(({ line, bucket }) => line.id === receiptLineId && bucket === bucketValue);
    if (!source) return;
    const { line, bucket } = source;
    setQuantity(Math.max(1, source.quantity));
    if (bucket === "damaged" && line.actualVariantId) {
      if (action === "restore_to_sellable") setToVariantId(line.actualVariantId);
      else setFromVariantId(line.actualVariantId);
    } else if (bucket === "missing" || bucket === "unidentified") {
      setToVariantId(line.expectedVariantId);
    } else if (bucket === "substitution" && line.actualVariantId) {
      setFromVariantId(line.actualVariantId);
      setToVariantId(line.expectedVariantId);
    } else if (bucket === "excess" && line.actualVariantId) {
      setFromVariantId(line.actualVariantId);
    }
  }

  async function requestCorrection() {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    const meta = ACTION_META[action];
    try {
      const response = await fetch("/api/admin/warehouse/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": operationKey.current },
        body: JSON.stringify({
          transferId,
          correctionType: meta.type,
          reasonCode: meta.reason,
          reason: reason.trim(),
          lines: [{
            action,
            fromVariantId: needsFrom ? fromVariantId : null,
            toVariantId: needsTo ? toVariantId : null,
            quantity,
            sourceReceiptLineId: sourceReceiptLineId || null,
            sourceBucket: sourceReceiptLineId ? sourceBucket : null,
            note: reason.trim(),
          }],
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Failed to create the correction document");
      operationKey.current = crypto.randomUUID();
      setReason("");
      setQuantity(1);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create the correction document");
      setBusy(false);
    }
  }

  async function approve(correctionId: string) {
    if (approving) return;
    setApproving(correctionId);
    setError("");
    try {
      const response = await fetch(`/api/admin/warehouse/corrections/${correctionId}/approve`, { method: "POST" });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Failed to approve the correction");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to approve the correction");
      setApproving(null);
    }
  }

  async function reject(correctionId: string) {
    if (rejectionNote.trim().length < 5 || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/warehouse/corrections/${correctionId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: rejectionNote.trim() }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Failed to reject the correction");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to reject the correction");
      setBusy(false);
    }
  }

  async function requestReversal(correctionId: string) {
    if (reversalNote.trim().length < 5 || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/warehouse/corrections/${correctionId}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": reversalOperationKey.current },
        body: JSON.stringify({ note: reversalNote.trim() }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Failed to create the reversal request");
      reversalOperationKey.current = crypto.randomUUID();
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create the reversal request");
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-[22px] bg-[#ece7e0] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
      <header className="border-b border-[#ddd4cc] px-5 py-4">
        <div className="flex items-center gap-2"><FilePenLine className="h-4 w-4 text-[#C85956]" /><div><p className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#C85956]">Related documents</p><h2 className="mt-1 text-[14px] font-extrabold text-[#302924]">Post-receipt corrections and reversals</h2></div></div>
      </header>

      {corrections.length ? (
        <div className="divide-y divide-[#ddd4cc]">
          {corrections.map((correction) => {
            const canReverse = correction.status === "posted"
              && !correction.reversesCorrectionId
              && correction.lines.length > 0
              && correction.lines.every((line) => ["reclassify", "adjust_in", "adjust_out"].includes(line.action) && !line.sourceReceiptLineId);
            return (
            <article key={correction.id} className="px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div><p className="text-[11.5px] font-extrabold text-[#302924]">{correction.correctionNumber}</p><p className="mt-1 text-[9.5px] text-[#756960]">{titleCase(correction.correctionType)} · {titleCase(correction.reasonCode)}</p></div>
                <span className={`w-fit rounded-lg px-2.5 py-1 text-[9px] font-bold ${correction.status === "posted" ? "bg-emerald-50 text-emerald-800" : correction.status === "pending_approval" ? "bg-amber-50 text-amber-900" : "bg-[#e2dcd4] text-[#62564d]"}`}>{titleCase(correction.status)}</span>
                {correction.status === "pending_approval" ? <div className="flex gap-2 sm:ml-auto"><button type="button" onClick={() => { setRejecting(rejecting === correction.id ? null : correction.id); setReversing(null); setError(""); }} className="inline-flex h-9 items-center rounded-xl bg-[#f8f4f0] px-3 text-[10.5px] font-bold text-[#675b52] hover:bg-[#e5ddd5]"><XCircle className="mr-1.5 h-3.5 w-3.5" />Reject</button><button type="button" onClick={() => approve(correction.id)} disabled={Boolean(approving) || busy} className="inline-flex h-9 items-center rounded-xl bg-[#242424] px-3 text-[10.5px] font-bold text-white hover:bg-[#3a332e] disabled:opacity-45">{approving === correction.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />}Approve & post</button></div> : null}
                {canReverse ? <button type="button" onClick={() => { setReversing(reversing === correction.id ? null : correction.id); setRejecting(null); setError(""); }} className="inline-flex h-9 items-center rounded-xl bg-[#f8f4f0] px-3 text-[10.5px] font-bold text-[#675b52] hover:bg-[#e5ddd5] sm:ml-auto"><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Request reversal</button> : null}
              </div>
              <p className="mt-2 text-[10.5px] leading-5 text-[#62564d]">{correction.note}</p>
              {correction.rejectionNote ? <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-800">Rejected: {correction.rejectionNote}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2">{correction.lines.map((line) => <span key={line.id} className="rounded-lg bg-[#f8f4f0] px-2.5 py-1.5 text-[9.5px] font-semibold text-[#62564d]">{titleCase(line.action)} · {formatCount(line.quantity)}{line.fromVariantId ? ` · from ${variantLabel.get(line.fromVariantId) ?? "Variant"}` : ""}{line.toVariantId ? ` · to ${variantLabel.get(line.toVariantId) ?? "Variant"}` : ""}</span>)}</div>
              {rejecting === correction.id ? <div className="mt-3 flex flex-col gap-2 rounded-xl bg-red-50 p-3 sm:flex-row"><input value={rejectionNote} onChange={(event) => setRejectionNote(event.target.value)} placeholder="Required rejection reason" className={`${CONTROL} flex-1 bg-white`} /><button type="button" onClick={() => reject(correction.id)} disabled={rejectionNote.trim().length < 5 || busy} className="inline-flex h-10 items-center justify-center rounded-xl bg-red-700 px-3 text-[10.5px] font-bold text-white disabled:opacity-45">{busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <XCircle className="mr-1.5 h-3.5 w-3.5" />}Confirm rejection</button></div> : null}
              {reversing === correction.id ? <div className="mt-3 rounded-xl bg-[#f8f4f0] p-3"><p className="mb-2 text-[10px] leading-5 text-[#756960]">This creates a separate inverse correction. It does not erase this document and still needs approval by another administrator.</p><div className="flex flex-col gap-2 sm:flex-row"><input value={reversalNote} onChange={(event) => setReversalNote(event.target.value)} placeholder="Why must this posted correction be reversed?" className={`${CONTROL} flex-1 bg-white`} /><button type="button" onClick={() => requestReversal(correction.id)} disabled={reversalNote.trim().length < 5 || busy} className="inline-flex h-10 items-center justify-center rounded-xl bg-[#242424] px-3 text-[10.5px] font-bold text-white disabled:opacity-45">{busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}Create reversal</button></div></div> : null}
            </article>
          );})}
        </div>
      ) : <p className="px-5 py-4 text-[10.5px] text-[#756960]">No correction documents are linked to this receipt.</p>}

      <details className="group border-t border-[#ddd4cc] px-5 py-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-extrabold text-[#403730] outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25 [&::-webkit-details-marker]:hidden"><FilePenLine className="h-3.5 w-3.5 text-[#C85956]" />Report an issue in a closed document</summary>
        <div className="mt-4 space-y-3">
          <p className="max-w-4xl text-[10.5px] leading-5 text-[#756960]">The original receipt will not be edited. This creates a linked correction note showing the old fact, the proposed change and the final posting. A different administrator must approve it.</p>
          <label className="block"><span className="text-[9px] font-bold uppercase tracking-[0.07em] text-[#756960]">Correction type</span><select value={action} onChange={(event) => { setAction(event.target.value as Action); setSourceReceiptLineId(""); setSourceBucket(""); }} className={`${CONTROL} mt-1 w-full bg-white`} >{(Object.entries(ACTION_META) as Array<[Action, { label: string }]>).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></label>
          {(requiresSource || discrepancySources.length > 0) ? <label className="block"><span className="text-[9px] font-bold uppercase tracking-[0.07em] text-[#756960]">Linked receipt discrepancy{requiresSource ? " — required" : " — optional"}</span><select value={sourceReceiptLineId && sourceBucket ? `${sourceReceiptLineId}:${sourceBucket}` : ""} onChange={(event) => chooseSource(event.target.value)} className={`${CONTROL} mt-1 w-full bg-white`}><option value="">{requiresSource ? "Choose the receipt issue being resolved…" : "General correction — no receipt issue"}</option>{discrepancySources.map(({ receiptNumber, line, bucket, quantity: sourceQuantity }) => <option key={`${line.id}:${bucket}`} value={`${line.id}:${bucket}`}>{receiptNumber} · {titleCase(bucket)} · {formatCount(sourceQuantity)} units · {variantLabel.get((bucket === "missing" || bucket === "unidentified" ? line.expectedVariantId : line.actualVariantId) ?? "") ?? "Variant"}</option>)}</select></label> : null}
          <div className="grid gap-3 lg:grid-cols-2">
            {needsFrom ? <VariantSelect label={action === "return_to_brand" || action === "write_off" ? "Held Variant" : "Recorded / source Variant"} value={fromVariantId} variants={variants} onChange={setFromVariantId} /> : null}
            {needsTo ? <VariantSelect label={action === "restore_to_sellable" ? "Variant to restore" : "Correct / target Variant"} value={toVariantId} variants={variants} onChange={setToVariantId} /> : null}
          </div>
          <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
            <label><span className="text-[9px] font-bold uppercase tracking-[0.07em] text-[#756960]">Quantity</span><input type="number" min={1} step={1} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.trunc(Number(event.target.value) || 1)))} className={`${CONTROL} mt-1 w-full bg-white font-bold tabular-nums`} /></label>
            <label><span className="text-[9px] font-bold uppercase tracking-[0.07em] text-[#756960]">Required explanation</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What was recorded, what is physically correct, and how was it verified?" className={`${CONTROL} mt-1 w-full bg-white`} /></label>
          </div>
          <div className="rounded-xl bg-[#f8f4f0] px-4 py-3">
            <p className="flex items-center gap-2 text-[10px] font-extrabold text-[#403730]"><ArrowLeftRight className="h-3.5 w-3.5 text-[#C85956]" />Posting preview</p>
            <p className="mt-1.5 text-[10px] leading-5 text-[#756960]">{action === "accept_discrepancy" ? `No stock quantity changes. ${sourceBucket ? `${titleCase(sourceBucket)} is accepted and closed for ${formatCount(quantity)} units. ` : ""}` : null}{needsFrom ? `${variantLabel.get(fromVariantId) ?? "Source Variant"}: ${action === "return_to_brand" || action === "write_off" ? "sellable balance unchanged; held units leave quarantine" : `−${formatCount(quantity)}`}. ` : ""}{needsTo ? `${variantLabel.get(toVariantId) ?? "Target Variant"}: +${formatCount(quantity)}.` : ""} Original document: unchanged.</p>
          </div>
          {error ? <p role="alert" className="flex items-center gap-2 text-[10.5px] font-semibold text-red-700"><AlertCircle className="h-3.5 w-3.5" />{error}</p> : null}
          <button type="button" onClick={requestCorrection} disabled={!valid || busy} className="inline-flex h-10 items-center rounded-xl bg-[#C85956] px-4 text-[11px] font-bold text-white hover:bg-[#b84e4b] disabled:opacity-45">{busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}Create correction for approval</button>
        </div>
      </details>
    </section>
  );
}

function VariantSelect({ label, value, variants, onChange }: { label: string; value: string; variants: WarehouseReceiptVariantOption[]; onChange: (value: string) => void }) {
  return <label><span className="text-[9px] font-bold uppercase tracking-[0.07em] text-[#756960]">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className={`${CONTROL} mt-1 w-full bg-white`}>{variants.map((variant) => <option key={variant.variantId} value={variant.variantId}>{variant.productName}{variant.optionLabel ? ` — ${variant.optionLabel}` : ""} · {variant.sku}</option>)}</select></label>;
}
