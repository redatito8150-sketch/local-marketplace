"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FilePenLine,
  Loader2,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { CONTROL, VariantIdentity, formatCount, titleCase } from "@/components/admin/inventory/shared";
import type {
  WarehouseCorrectionLineRow,
  WarehouseCorrectionRow,
  WarehouseReceiptLineRow,
  WarehouseReceiptRow,
  WarehouseReceiptVariantOption,
  WarehouseTransferItemRow,
} from "@/lib/data/warehouse";
import { describeWarehouseCorrectionLine } from "@/components/warehouse/warehouseCorrectionPresentation";
import { formatDateTime } from "@/lib/format";

type IssueKind = "wrong_variant" | "quantity" | "condition" | "close_discrepancy" | "document_note";
type QuantityDirection = "add" | "remove";
type ConditionAction = "move_to_hold" | "restore_to_sellable" | "return_to_brand" | "write_off";

type CorrectionPayloadLine = {
  action: WarehouseCorrectionLineRow["action"];
  fromVariantId: string | null;
  toVariantId: string | null;
  quantity: number;
  sourceReceiptLineId: string | null;
  sourceCorrectionLineId: string | null;
  sourceBucket: WarehouseCorrectionLineRow["sourceBucket"];
  note: string;
};

type IssueDraft = {
  id: string;
  itemId: string;
  kind: IssueKind;
  label: string;
  preview: string;
  correctionType: WarehouseCorrectionRow["correctionType"];
  reasonCode: string;
  note: string;
  line: CorrectionPayloadLine;
};

type ResolutionSource = {
  value: string;
  label: string;
  quantity: number;
  variantId: string;
  sourceReceiptLineId: string | null;
  sourceCorrectionLineId: string | null;
};

const ISSUE_META: Record<IssueKind, { label: string; description: string }> = {
  wrong_variant: { label: "Wrong Variant", description: "Move recorded sellable units to the correct Variant." },
  quantity: { label: "Wrong quantity", description: "Add missing sellable units or remove an overcount." },
  condition: { label: "Condition changed", description: "Place stock on hold or resolve damaged stock." },
  close_discrepancy: { label: "Close a known difference", description: "Accept a documented shortage, substitution or excess." },
  document_note: { label: "Document information", description: "Append an approved note without changing stock." },
};

function correctionTone(status: WarehouseCorrectionRow["status"]): string {
  if (status === "posted") return "bg-emerald-50 text-emerald-800";
  if (status === "pending_approval") return "bg-amber-50 text-amber-900";
  if (status === "rejected") return "bg-red-50 text-red-800";
  return "bg-[#e2dcd4] text-[#62564d]";
}

type CorrectionLineMeta = {
  label: string;
  impact: string;
  icon: typeof PackageCheck;
  iconClassName: string;
  panelClassName: string;
};

function correctionLineMeta(line: WarehouseCorrectionLineRow): CorrectionLineMeta {
  const quantity = formatCount(line.quantity);
  if (line.action === "reclassify") return { label: "Variant corrected", impact: `${quantity} units moved to the correct Variant`, icon: RotateCcw, iconClassName: "bg-violet-50 text-violet-700", panelClassName: "bg-violet-50/60 text-violet-800" };
  if (line.action === "adjust_in" && line.sourceBucket === "missing") return { label: "Missing stock recovered", impact: `Sellable +${quantity} · Missing closed`, icon: PackagePlus, iconClassName: "bg-emerald-50 text-emerald-700", panelClassName: "bg-emerald-50/70 text-emerald-800" };
  if (line.action === "adjust_out" && line.sourceBucket === "excess") return { label: "Excess stock corrected", impact: `Sellable −${quantity} · Excess closed`, icon: PackageMinus, iconClassName: "bg-rose-50 text-rose-700", panelClassName: "bg-rose-50/70 text-rose-800" };
  if (line.action === "adjust_in") return { label: "Stock added", impact: `Sellable stock +${quantity}`, icon: PackagePlus, iconClassName: "bg-emerald-50 text-emerald-700", panelClassName: "bg-emerald-50/70 text-emerald-800" };
  if (line.action === "adjust_out") return { label: "Stock removed", impact: `Sellable stock −${quantity}`, icon: PackageMinus, iconClassName: "bg-rose-50 text-rose-700", panelClassName: "bg-rose-50/70 text-rose-800" };
  if (line.action === "move_to_hold") return { label: "Moved to damaged hold", impact: `Sellable −${quantity} · Hold +${quantity}`, icon: CircleAlert, iconClassName: "bg-amber-50 text-amber-700", panelClassName: "bg-amber-50/75 text-amber-900" };
  if (line.action === "restore_to_sellable") return { label: "Restored to sellable", impact: `Sellable stock +${quantity}`, icon: PackageCheck, iconClassName: "bg-emerald-50 text-emerald-700", panelClassName: "bg-emerald-50/70 text-emerald-800" };
  if (line.action === "return_to_brand") return { label: "Returned to brand", impact: `Damaged hold −${quantity}`, icon: RotateCcw, iconClassName: "bg-sky-50 text-sky-700", panelClassName: "bg-sky-50/70 text-sky-800" };
  if (line.action === "write_off") return { label: "Written off", impact: `${quantity} units removed from damaged hold`, icon: XCircle, iconClassName: "bg-rose-50 text-rose-700", panelClassName: "bg-rose-50/70 text-rose-800" };
  const difference = line.sourceBucket ? titleCase(line.sourceBucket) : "Document difference";
  return { label: `${difference} accepted`, impact: "No stock movement", icon: CheckCircle2, iconClassName: "bg-amber-50 text-amber-700", panelClassName: "bg-amber-50/75 text-amber-900" };
}

function correctionBelongsToItem({
  line,
  item,
  receiptLine,
  items,
}: {
  line: WarehouseCorrectionLineRow;
  item: WarehouseTransferItemRow;
  receiptLine: WarehouseReceiptLineRow | undefined;
  items: WarehouseTransferItemRow[];
}): boolean {
  if (line.sourceReceiptLineId) return line.sourceReceiptLineId === receiptLine?.id;
  if (line.fromVariantId) return line.fromVariantId === item.variantId;
  if (!line.toVariantId) return false;
  const targetHasOwnDocumentLine = items.some((candidate) => candidate.variantId === line.toVariantId);
  return targetHasOwnDocumentLine && line.toVariantId === item.variantId;
}

export default function WarehouseCorrectionWorkspace({
  transferId,
  items,
  variants,
  corrections,
  receipts,
  brandSlug,
  readOnly = false,
  isReturn = false,
}: {
  transferId: string;
  items: WarehouseTransferItemRow[];
  variants: WarehouseReceiptVariantOption[];
  corrections: WarehouseCorrectionRow[];
  receipts: WarehouseReceiptRow[];
  brandSlug: string;
  readOnly?: boolean;
  isReturn?: boolean;
}) {
  const router = useRouter();
  const operationKey = useRef(crypto.randomUUID());
  const reversalOperationKey = useRef(crypto.randomUUID());
  const [drafts, setDrafts] = useState<IssueDraft[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [kind, setKind] = useState<IssueKind>("wrong_variant");
  const [quantity, setQuantity] = useState(1);
  const [quantityDirection, setQuantityDirection] = useState<QuantityDirection>("add");
  const [targetVariantId, setTargetVariantId] = useState(variants[0]?.variantId ?? "");
  const [conditionAction, setConditionAction] = useState<ConditionAction>("move_to_hold");
  const [conditionSource, setConditionSource] = useState("");
  const [discrepancySource, setDiscrepancySource] = useState("");
  const [explanation, setExplanation] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [reversing, setReversing] = useState<string | null>(null);
  const [reversalNote, setReversalNote] = useState("");
  const [error, setError] = useState("");

  const receiptLines = useMemo(() => receipts.flatMap((receipt) => receipt.lines), [receipts]);
  const receiptLineByItem = useMemo(() => new Map(receiptLines.map((line) => [line.expectedTransferItemId, line])), [receiptLines]);
  const variantById = useMemo(() => {
    const map = new Map<string, WarehouseReceiptVariantOption>();
    for (const item of items) map.set(item.variantId, { variantId: item.variantId, productName: item.productName, productImage: item.productImage, sku: item.sku, optionLabel: item.optionLabel });
    for (const variant of variants) map.set(variant.variantId, variant);
    return map;
  }, [items, variants]);
  const variantLabel = useMemo(() => new Map([...variantById.values()].map((variant) => [variant.variantId, `${variant.productName}${variant.optionLabel ? ` — ${variant.optionLabel}` : ""} · ${variant.sku}`])), [variantById]);
  const activeCorrections = useMemo(() => corrections.filter((correction) => correction.status === "posted" || correction.status === "pending_approval"), [corrections]);
  const totalRequested = items.reduce((sum, item) => sum + item.requestedQty, 0);
  const totalAccepted = isReturn
    ? items.reduce((sum, item) => sum + (item.dispatchedQty ?? item.receivedOkQty ?? 0), 0)
    : receiptLines.length
      ? receiptLines.reduce((sum, line) => sum + line.actualGoodQty, 0)
      : items.reduce((sum, item) => sum + (item.receivedOkQty ?? 0), 0);

  function usedReceiptSource(lineId: string, bucket: WarehouseCorrectionLineRow["sourceBucket"]): number {
    const persisted = activeCorrections.reduce((sum, correction) => sum + correction.lines
      .filter((line) => line.sourceReceiptLineId === lineId && line.sourceBucket === bucket)
      .reduce((lineSum, line) => lineSum + line.quantity, 0), 0);
    const staged = drafts
      .filter((draft) => draft.line.sourceReceiptLineId === lineId && draft.line.sourceBucket === bucket)
      .reduce((sum, draft) => sum + draft.line.quantity, 0);
    return persisted + staged;
  }

  function usedHoldSource(lineId: string): number {
    const persisted = activeCorrections.reduce((sum, correction) => sum + correction.lines
      .filter((line) => line.sourceCorrectionLineId === lineId)
      .reduce((lineSum, line) => lineSum + line.quantity, 0), 0);
    const staged = drafts
      .filter((draft) => draft.line.sourceCorrectionLineId === lineId)
      .reduce((sum, draft) => sum + draft.line.quantity, 0);
    return persisted + staged;
  }

  function conditionSources(item: WarehouseTransferItemRow, receiptLine: WarehouseReceiptLineRow | undefined): ResolutionSource[] {
    const sources: ResolutionSource[] = [];
    const actualVariantId = receiptLine?.actualVariantId ?? item.variantId;
    if (receiptLine && receiptLine.actualDamagedQty > 0) {
      const remaining = Math.max(0, receiptLine.actualDamagedQty - usedReceiptSource(receiptLine.id, "damaged"));
      if (remaining > 0) sources.push({
        value: `receipt:${receiptLine.id}`,
        label: `Original damaged stock · ${formatCount(remaining)} available`,
        quantity: remaining,
        variantId: actualVariantId,
        sourceReceiptLineId: receiptLine.id,
        sourceCorrectionLineId: null,
      });
    }
    for (const correction of corrections) {
      if (correction.status !== "posted") continue;
      for (const line of correction.lines) {
        if (line.action !== "move_to_hold" || line.fromVariantId !== actualVariantId) continue;
        const remaining = Math.max(0, line.quantity - usedHoldSource(line.id));
        if (remaining > 0) sources.push({
          value: `hold:${line.id}`,
          label: `${correction.correctionNumber} hold · ${formatCount(remaining)} available`,
          quantity: remaining,
          variantId: actualVariantId,
          sourceReceiptLineId: null,
          sourceCorrectionLineId: line.id,
        });
      }
    }
    return sources;
  }

  function discrepancySourcesFor(receiptLine: WarehouseReceiptLineRow | undefined) {
    if (!receiptLine) return [];
    const candidates: Array<{ bucket: "missing" | "substitution" | "excess"; quantity: number; label: string }> = [];
    const missing = Math.max(0, receiptLine.expectedMissingQty - usedReceiptSource(receiptLine.id, "missing"));
    if (missing > 0) candidates.push({ bucket: "missing", quantity: missing, label: `Missing · ${formatCount(missing)} units` });
    const substitutionBase = receiptLine.actualVariantId && receiptLine.actualVariantId !== receiptLine.expectedVariantId ? receiptLine.actualGoodQty : 0;
    const substitution = Math.max(0, substitutionBase - usedReceiptSource(receiptLine.id, "substitution"));
    if (substitution > 0) candidates.push({ bucket: "substitution", quantity: substitution, label: `Substitution · ${formatCount(substitution)} units` });
    const excess = Math.max(0, receiptLine.actualExcessQty - usedReceiptSource(receiptLine.id, "excess"));
    if (excess > 0) candidates.push({ bucket: "excess", quantity: excess, label: `Excess · ${formatCount(excess)} units` });
    return candidates;
  }

  function startIssue(item: WarehouseTransferItemRow) {
    const receiptLine = receiptLineByItem.get(item.id);
    const currentVariantId = receiptLine?.actualVariantId ?? item.variantId;
    const nextTarget = variants.find((variant) => variant.variantId !== currentVariantId)?.variantId ?? currentVariantId;
    const sources = conditionSources(item, receiptLine);
    const discrepancies = discrepancySourcesFor(receiptLine);
    const sellableRemaining = receiptLine ? Math.max(0, receiptLine.actualGoodQty - usedReceiptSource(receiptLine.id, "sellable")) : 0;
    setEditingItemId(item.id);
    setKind("wrong_variant");
    setQuantity(Math.max(1, Math.min(receiptLine?.actualGoodQty ?? item.receivedOkQty ?? 1, 999)));
    setQuantityDirection("add");
    setTargetVariantId(nextTarget);
    setConditionAction(sellableRemaining > 0 ? "move_to_hold" : "restore_to_sellable");
    setConditionSource(sources[0]?.value ?? "");
    setDiscrepancySource(discrepancies[0]?.bucket ?? "");
    setExplanation("");
    setReviewing(false);
    setError("");
  }

  function saveIssue(item: WarehouseTransferItemRow) {
    const receiptLine = receiptLineByItem.get(item.id);
    const currentVariantId = receiptLine?.actualVariantId ?? item.variantId;
    const note = explanation.trim();
    if (note.length < 5 || !Number.isInteger(quantity) || quantity <= 0) {
      setError("Enter a positive quantity and explain what was verified.");
      return;
    }
    if (drafts.length && (kind === "document_note") !== drafts.every((draft) => draft.kind === "document_note")) {
      setError("Document-only notes and stock corrections must be submitted as separate approvals.");
      return;
    }

    let draft: IssueDraft | null = null;
    if (kind === "wrong_variant") {
      if (!currentVariantId || !targetVariantId || currentVariantId === targetVariantId) {
        setError("Choose a different correct Variant.");
        return;
      }
      const canLinkSubstitution = Boolean(receiptLine?.actualVariantId && receiptLine.actualVariantId !== receiptLine.expectedVariantId && targetVariantId === receiptLine.expectedVariantId);
      if (receiptLine) {
        const sourceBucket = canLinkSubstitution ? "substitution" : "sellable";
        const available = receiptLine.actualGoodQty - usedReceiptSource(receiptLine.id, sourceBucket);
        if (quantity > available) {
          setError(`Only ${formatCount(Math.max(0, available))} recorded sellable units remain available for this correction.`);
          return;
        }
      }
      draft = {
        id: crypto.randomUUID(), itemId: item.id, kind,
        label: "Wrong Variant",
        preview: `${variantLabel.get(currentVariantId) ?? item.sku} → ${variantLabel.get(targetVariantId) ?? "Correct Variant"} · ${formatCount(quantity)}`,
        correctionType: "reclassification", reasonCode: "wrong_variant", note,
        line: { action: "reclassify", fromVariantId: currentVariantId, toVariantId: targetVariantId, quantity, sourceReceiptLineId: receiptLine?.id ?? null, sourceCorrectionLineId: null, sourceBucket: canLinkSubstitution ? "substitution" : receiptLine ? "sellable" : null, note },
      };
    } else if (kind === "quantity") {
      const openMissing = receiptLine
        ? Math.max(0, receiptLine.expectedMissingQty - usedReceiptSource(receiptLine.id, "missing"))
        : 0;
      const openExcess = receiptLine
        ? Math.max(0, receiptLine.actualExcessQty - usedReceiptSource(receiptLine.id, "excess"))
        : 0;
      const linksMissing = quantityDirection === "add" && openMissing > 0;
      const linksExcess = quantityDirection === "remove" && openExcess > 0;
      const linkedAvailable = linksMissing ? openMissing : linksExcess ? openExcess : null;
      if (linkedAvailable !== null && quantity > linkedAvailable) {
        setError(`Only ${formatCount(linkedAvailable)} open ${linksMissing ? "missing" : "excess"} units can be corrected for this receipt line.`);
        return;
      }
      const affectedVariantId = linksMissing
        ? receiptLine!.expectedVariantId
        : linksExcess
          ? receiptLine!.actualVariantId ?? receiptLine!.expectedVariantId
          : currentVariantId;
      const closesReceiptDifference = linksMissing || linksExcess;
      draft = {
        id: crypto.randomUUID(), itemId: item.id, kind,
        label: linksMissing ? "Recover missing stock" : linksExcess ? "Correct recorded excess" : quantityDirection === "add" ? "Add sellable stock" : "Remove overcounted stock",
        preview: `${variantLabel.get(affectedVariantId) ?? item.sku}: ${quantityDirection === "add" ? "+" : "−"}${formatCount(quantity)} sellable${closesReceiptDifference ? ` · ${linksMissing ? "Missing" : "Excess"} closed` : ""}`,
        correctionType: quantityDirection === "add" ? "missing_recovery" : "quantity_adjustment",
        reasonCode: quantityDirection === "add" ? "missing_found" : "count_error", note,
        line: {
          action: quantityDirection === "add" ? "adjust_in" : "adjust_out",
          fromVariantId: quantityDirection === "remove" ? affectedVariantId : null,
          toVariantId: quantityDirection === "add" ? affectedVariantId : null,
          quantity,
          sourceReceiptLineId: closesReceiptDifference ? receiptLine!.id : null,
          sourceCorrectionLineId: null,
          sourceBucket: linksMissing ? "missing" : linksExcess ? "excess" : null,
          note,
        },
      };
    } else if (kind === "condition") {
      if (conditionAction === "move_to_hold") {
        if (!receiptLine) { setError("A posted receipt line is required for a new hold."); return; }
        const remaining = Math.max(0, receiptLine.actualGoodQty - usedReceiptSource(receiptLine.id, "sellable"));
        if (quantity > remaining) { setError(`Only ${formatCount(remaining)} recorded sellable units can be moved to hold.`); return; }
        draft = {
          id: crypto.randomUUID(), itemId: item.id, kind, label: "Move sellable stock to hold",
          preview: `${variantLabel.get(currentVariantId) ?? item.sku}: ${formatCount(quantity)} sellable → damaged hold`,
          correctionType: "condition_resolution", reasonCode: "other", note,
          line: { action: "move_to_hold", fromVariantId: currentVariantId, toVariantId: null, quantity, sourceReceiptLineId: receiptLine.id, sourceCorrectionLineId: null, sourceBucket: "sellable", note },
        };
      } else {
        const source = conditionSources(item, receiptLine).find((candidate) => candidate.value === conditionSource);
        if (!source || quantity > source.quantity) { setError("Choose an available damaged-stock source and stay within its open quantity."); return; }
        const actionLabel = conditionAction === "restore_to_sellable" ? "Restore hold to sellable" : conditionAction === "return_to_brand" ? "Return hold to brand" : "Write off hold";
        draft = {
          id: crypto.randomUUID(), itemId: item.id, kind, label: actionLabel,
          preview: `${variantLabel.get(source.variantId) ?? item.sku}: ${formatCount(quantity)} ${conditionAction === "restore_to_sellable" ? "hold → sellable" : conditionAction === "return_to_brand" ? "hold → brand" : "hold → written off"}`,
          correctionType: "condition_resolution",
          reasonCode: conditionAction === "restore_to_sellable" ? "damage_regraded" : conditionAction === "return_to_brand" ? "return_to_brand" : "write_off",
          note,
          line: { action: conditionAction, fromVariantId: conditionAction === "restore_to_sellable" ? null : source.variantId, toVariantId: conditionAction === "restore_to_sellable" ? source.variantId : null, quantity, sourceReceiptLineId: source.sourceReceiptLineId, sourceCorrectionLineId: source.sourceCorrectionLineId, sourceBucket: source.sourceReceiptLineId ? "damaged" : null, note },
        };
      }
    } else if (kind === "close_discrepancy") {
      const source = discrepancySourcesFor(receiptLine).find((candidate) => candidate.bucket === discrepancySource);
      if (!receiptLine || !source || quantity > source.quantity) { setError("Choose an open receipt difference and stay within its open quantity."); return; }
      draft = {
        id: crypto.randomUUID(), itemId: item.id, kind, label: `Accept ${titleCase(source.bucket)}`,
        preview: `${titleCase(source.bucket)} closed with no stock movement · ${formatCount(quantity)}`,
        correctionType: "condition_resolution", reasonCode: "other", note,
        line: { action: "accept_discrepancy", fromVariantId: null, toVariantId: null, quantity, sourceReceiptLineId: receiptLine.id, sourceCorrectionLineId: null, sourceBucket: source.bucket, note },
      };
    } else {
      draft = {
        id: crypto.randomUUID(), itemId: item.id, kind, label: "Document amendment",
        preview: "Approved note only · no stock movement",
        correctionType: "document_amendment", reasonCode: "document_error", note,
        line: { action: "accept_discrepancy", fromVariantId: null, toVariantId: null, quantity: 1, sourceReceiptLineId: receiptLine?.id ?? null, sourceCorrectionLineId: null, sourceBucket: receiptLine ? "document" : null, note },
      };
    }

    setDrafts((current) => [...current, draft!]);
    setEditingItemId(null);
    setExplanation("");
    setReviewing(false);
    setError("");
  }

  async function requestCorrection() {
    if (!drafts.length || busy) return;
    setBusy(true);
    setError("");
    const correctionTypes = new Set(drafts.map((draft) => draft.correctionType));
    const reasonCodes = new Set(drafts.map((draft) => draft.reasonCode));
    const correctionType = correctionTypes.size === 1 ? drafts[0].correctionType : "condition_resolution";
    const reasonCode = reasonCodes.size === 1 ? drafts[0].reasonCode : "other";
    const note = drafts.map((draft) => `${draft.label}: ${draft.note}`).join(" | ");
    try {
      const response = await fetch("/api/admin/warehouse/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": operationKey.current },
        body: JSON.stringify({ transferId, correctionType, reasonCode, reason: note, lines: drafts.map((draft) => draft.line) }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Failed to create the correction document");
      operationKey.current = crypto.randomUUID();
      setDrafts([]);
      setReviewing(false);
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
      const response = await fetch(`/api/admin/warehouse/corrections/${correctionId}/reject`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: rejectionNote.trim() }) });
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
      const response = await fetch(`/api/admin/warehouse/corrections/${correctionId}/reverse`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": reversalOperationKey.current }, body: JSON.stringify({ note: reversalNote.trim() }) });
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
    <section className="overflow-hidden rounded-[22px] border border-[#e6ded7] bg-white shadow-[0_10px_30px_rgba(72,50,36,.045)]">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#ddd4cc] px-5 py-4">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#C85956]">Document lines</p><h2 className="mt-1 text-[15px] font-extrabold text-[#302924]">{isReturn ? "Every Variant and its recorded return" : "Every Variant and its recorded receipt"}</h2></div>
        <div className="text-right"><p className="text-[11px] font-extrabold text-[#403730]">{formatCount(items.length)} variants · {formatCount(totalRequested)} units</p><p className="mt-0.5 text-[9.5px] text-[#8d8076]">{formatCount(totalAccepted)} {isReturn ? "returned" : "accepted"}</p></div>
      </header>

      {error ? <div role="alert" className="mx-5 mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-[11px] font-semibold text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}

      <div className="divide-y divide-[#ddd4cc]">
        {items.map((item) => {
          const receiptLine = receiptLineByItem.get(item.id);
          const currentVariantId = receiptLine?.actualVariantId ?? item.variantId;
          const rowCorrectionGroups = corrections.map((correction) => ({
            correction,
            lines: correction.lines.filter((line) => correctionBelongsToItem({ line, item, receiptLine, items })),
          })).filter((group) => group.lines.length > 0);
          const rowCorrectionCount = rowCorrectionGroups.reduce((sum, group) => sum + group.lines.length, 0);
          const itemDrafts = drafts.filter((draft) => draft.itemId === item.id);
          const sources = conditionSources(item, receiptLine);
          const discrepancies = discrepancySourcesFor(receiptLine);
          const sellableRemaining = receiptLine ? Math.max(0, receiptLine.actualGoodQty - usedReceiptSource(receiptLine.id, "sellable")) : 0;
          const recordedVariantDiffers = Boolean(receiptLine?.actualVariantId && receiptLine.actualVariantId !== item.variantId);
          const recordedVariantLabel = receiptLine?.actualVariantId
            ? variantLabel.get(receiptLine.actualVariantId) ?? receiptLine.actualVariantId
            : receiptLine?.unidentifiedSku
              ? `Unidentified · ${receiptLine.unidentifiedSku}`
              : null;
          const damagedQuantity = receiptLine?.actualDamagedQty ?? item.damagedQty ?? 0;
          const missingQuantity = receiptLine?.expectedMissingQty ?? item.missingQty ?? 0;
          const readOnlyIssueSummary = [
            recordedVariantDiffers || receiptLine?.unidentifiedSku ? "Different Variant recorded" : null,
            damagedQuantity > 0 ? `${formatCount(damagedQuantity)} damaged` : null,
            missingQuantity > 0 ? `${formatCount(missingQuantity)} missing` : null,
          ].filter((value): value is string => Boolean(value));
          return (
            <article key={item.id} className={`px-5 py-4 ${editingItemId === item.id ? "bg-[#f2ece6]" : ""}`}>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <div className="min-w-0 flex-1"><VariantIdentity image={item.productImage} productName={item.productName} label={`${item.productName}${item.optionLabel ? ` — ${item.optionLabel}` : ""}`} sku={item.sku} />{recordedVariantDiffers || receiptLine?.unidentifiedSku ? <p className="mt-1.5 w-fit rounded-lg bg-violet-50 px-2 py-1 text-[8.5px] font-bold text-violet-800">Recorded receipt: {recordedVariantLabel}</p> : null}{readOnly && readOnlyIssueSummary.length ? <p className="mt-1.5 w-fit rounded-lg bg-amber-50 px-2 py-1 text-[8.5px] font-bold text-amber-900">Receipt issue · {readOnlyIssueSummary.join(" · ")}</p> : null}</div>
                <div className="flex flex-wrap items-end gap-2 xl:justify-end">
                  <StaticMetric label="Requested" value={item.requestedQty} />
                  <StaticMetric label={isReturn ? "Returned" : "Received"} value={isReturn ? item.dispatchedQty ?? item.receivedOkQty ?? 0 : receiptLine?.actualGoodQty ?? item.receivedOkQty ?? 0} />
                  <StaticMetric label="Damaged" value={damagedQuantity} warning={damagedQuantity > 0} />
                  <StaticMetric label="Missing" value={missingQuantity} warning={missingQuantity > 0} />
                  {!readOnly ? <button type="button" onClick={() => editingItemId === item.id ? setEditingItemId(null) : startIssue(item)} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#f8f4f0] px-3 text-[9.5px] font-bold text-[#62564d] transition hover:bg-[#f4dfdc] hover:text-[#9f3f3d]"><CircleAlert className="h-3.5 w-3.5" />Report issue<ChevronDown className={`h-3 w-3 transition-transform ${editingItemId === item.id ? "rotate-180" : ""}`} /></button> : null}
                  <Link href={readOnly ? `/brand-portal/stock?view=activity&brand=${encodeURIComponent(brandSlug)}&q=${encodeURIComponent(item.sku)}` : `/admin/inventory?view=activity&brand=${encodeURIComponent(brandSlug)}&variantId=${encodeURIComponent(currentVariantId)}`} className="inline-flex h-10 items-center gap-1 rounded-xl bg-[#e2dcd4] px-3 text-[9.5px] font-bold text-[#5b5049] hover:bg-[#efe9e4] hover:text-[#302924]"><Activity className="h-3 w-3" />Ledger</Link>
                </div>
              </div>

              {itemDrafts.length ? <div className="mt-3 flex flex-wrap gap-1.5">{itemDrafts.map((draft) => <span key={draft.id} className="rounded-lg bg-violet-50 px-2.5 py-1 text-[9px] font-bold text-violet-800">Draft · {draft.label}</span>)}</div> : null}

              {rowCorrectionGroups.length ? <>
                {rowCorrectionGroups.map(({ correction }) => <span key={`anchor-${correction.id}`} id={`warehouse-correction-${correction.id}`} className="block scroll-mt-24" />)}
                <details className="group mt-3 w-fit max-w-full open:w-full">
                <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg bg-[#f8f4f0] px-2.5 py-1.5 text-[9px] font-extrabold text-[#62564d] outline-none transition hover:bg-[#f3ece6] focus-visible:ring-2 focus-visible:ring-[#C85956] [&::-webkit-details-marker]:hidden">
                  <FilePenLine className="h-3 w-3 text-[#C85956]" />
                  Corrected · {formatCount(rowCorrectionCount)} change{rowCorrectionCount === 1 ? "" : "s"}
                  <span className="text-[8px] font-medium text-[#94867c]">{formatCount(rowCorrectionGroups.length)} CRN{rowCorrectionGroups.length === 1 ? "" : "s"}</span>
                  <ChevronDown className="ml-0.5 h-3 w-3 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-2 overflow-hidden rounded-xl border border-[#e7ded7] bg-white px-3">
                  {rowCorrectionGroups.map(({ correction, lines }, correctionIndex) => {
                    const ownsDocumentControls = lines.some((line) => line.id === correction.lines[0]?.id);
                    const canReverse = correction.status === "posted" && !correction.reversesCorrectionId && correction.lines.length > 0 && correction.lines.every((line) => ["reclassify", "adjust_in", "adjust_out"].includes(line.action) && !line.sourceReceiptLineId && !line.sourceCorrectionLineId);
                    return <section key={correction.id} className={correctionIndex ? "border-t border-[#eee7e1]" : ""}>
                      <header className="flex flex-wrap items-center gap-2 py-2.5">
                        <span className="text-[9.5px] font-extrabold text-[#403730]">{correction.correctionNumber}</span>
                        <span className={`rounded-md px-1.5 py-0.5 text-[7.5px] font-extrabold ${correctionTone(correction.status)}`}>{titleCase(correction.status)}</span>
                        <span className="text-[8.5px] text-[#94867c]">{formatDateTime(correction.postedAt ?? correction.approvedAt ?? correction.requestedAt)}</span>
                        {!readOnly && ownsDocumentControls && correction.status === "pending_approval" ? <div className="flex gap-1.5 sm:ml-auto">
                          <button type="button" onClick={() => { setRejecting(rejecting === correction.id ? null : correction.id); setReversing(null); }} className="inline-flex h-7 items-center rounded-lg px-2 text-[8.5px] font-bold text-[#675b52] hover:bg-rose-50 hover:text-rose-700"><XCircle className="mr-1 h-3 w-3" />Reject</button>
                          <button type="button" onClick={() => approve(correction.id)} disabled={Boolean(approving) || busy} className="inline-flex h-7 items-center rounded-lg bg-[#C85956] px-2 text-[8.5px] font-bold text-white hover:bg-[#b84e4b] disabled:opacity-45">{approving === correction.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ShieldCheck className="mr-1 h-3 w-3" />}Approve</button>
                        </div> : !readOnly && ownsDocumentControls && canReverse ? <button type="button" onClick={() => { setReversing(reversing === correction.id ? null : correction.id); setRejecting(null); }} className="inline-flex h-7 items-center rounded-lg px-2 text-[8.5px] font-bold text-[#675b52] hover:bg-[#eee7e1] sm:ml-auto"><RotateCcw className="mr-1 h-3 w-3" />Request reversal</button> : null}
                      </header>
                      <ol className="pb-2.5">
                        {lines.map((line, lineIndex) => {
                          const meta = correctionLineMeta(line);
                          const Icon = meta.icon;
                          return <li key={line.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2.5">
                            <div className="flex flex-col items-center"><span className={`flex h-6 w-6 items-center justify-center rounded-full ${meta.iconClassName}`}><Icon className="h-3 w-3" /></span>{lineIndex < lines.length - 1 ? <span className="min-h-4 w-px flex-1 bg-[#ddd4cc]" /> : null}</div>
                            <div className="min-w-0 pb-2.5">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><p className="text-[9.5px] font-extrabold text-[#403730]">{meta.label}</p><span className={`rounded-md px-1.5 py-0.5 text-[7.5px] font-extrabold ${meta.panelClassName}`}>{meta.impact}</span></div>
                              <p className="mt-1 text-[8.5px] leading-4 text-[#8d8076]">{describeWarehouseCorrectionLine(line, variantLabel)}</p>
                              {line.note ? <p className="mt-1 truncate text-[8.5px] leading-4 text-[#756960]" title={line.note}><strong className="font-extrabold text-[#62564d]">Verified:</strong> {line.note}</p> : null}
                            </div>
                          </li>;
                        })}
                      </ol>
                      {correction.rejectionNote ? <p className="mb-2.5 rounded-lg bg-red-50 px-2.5 py-2 text-[8.5px] font-semibold text-red-800">Rejected: {correction.rejectionNote}</p> : null}
                      {!readOnly && ownsDocumentControls && rejecting === correction.id ? <div className="mb-2.5 flex flex-col gap-2 sm:flex-row"><input value={rejectionNote} onChange={(event) => setRejectionNote(event.target.value)} placeholder="Required rejection reason" className={`${CONTROL} flex-1 bg-white`} /><button type="button" onClick={() => reject(correction.id)} disabled={rejectionNote.trim().length < 5 || busy} className="h-10 rounded-xl bg-[#C85956] px-3 text-[9.5px] font-bold text-white hover:bg-[#b84e4b] disabled:opacity-45">Confirm rejection</button></div> : null}
                      {!readOnly && ownsDocumentControls && reversing === correction.id ? <div className="mb-2.5 rounded-xl bg-[#f8f4f0] p-3"><p className="mb-2 text-[9px] text-[#8d8076]">A reversal keeps the original entry and creates a separately approved counter-entry.</p><div className="flex flex-col gap-2 sm:flex-row"><input value={reversalNote} onChange={(event) => setReversalNote(event.target.value)} placeholder="Why must this posted correction be reversed?" className={`${CONTROL} flex-1 bg-white`} /><button type="button" onClick={() => requestReversal(correction.id)} disabled={reversalNote.trim().length < 5 || busy} className="h-10 rounded-xl bg-[#C85956] px-3 text-[9.5px] font-bold text-white hover:bg-[#b84e4b] disabled:opacity-45">Create reversal</button></div></div> : null}
                    </section>;
                  })}
                </div>
                </details>
              </> : null}

              {!readOnly && editingItemId === item.id ? (
                <div className="mt-4 rounded-2xl bg-[#f8f4f0] p-4">
                  <p className="text-[10px] font-extrabold text-[#403730]">What is wrong?</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{(Object.entries(ISSUE_META) as Array<[IssueKind, { label: string; description: string }]>).map(([value, meta]) => <button key={value} type="button" onClick={() => {
                    setKind(value);
                    if (value === "quantity") {
                      const openMissing = discrepancies.find((candidate) => candidate.bucket === "missing");
                      const openExcess = discrepancies.find((candidate) => candidate.bucket === "excess");
                      if (openMissing) {
                        setQuantityDirection("add");
                        setQuantity(openMissing.quantity);
                      } else if (openExcess) {
                        setQuantityDirection("remove");
                        setQuantity(openExcess.quantity);
                      } else {
                        setQuantity(1);
                      }
                    }
                    setError("");
                  }} className={`rounded-xl px-3 py-2.5 text-left transition ${kind === value ? "bg-[#f4dfdc] text-[#9f3f3d] ring-1 ring-inset ring-[#e8c5c2]" : "bg-white text-[#62564d] hover:bg-[#eee7e1]"}`}><span className="block text-[10px] font-extrabold">{meta.label}</span><span className={`mt-1 block text-[8.5px] leading-4 ${kind === value ? "text-[#b76a67]" : "text-[#8d8076]"}`}>{meta.description}</span></button>)}</div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {kind === "wrong_variant" ? <label><span className="text-[9px] font-bold uppercase tracking-[0.07em] text-[#756960]">Correct Variant</span><select value={targetVariantId} onChange={(event) => setTargetVariantId(event.target.value)} className={`${CONTROL} mt-1 w-full bg-white`}>{variants.map((variant) => <option key={variant.variantId} value={variant.variantId}>{variant.productName}{variant.optionLabel ? ` — ${variant.optionLabel}` : ""} · {variant.sku}</option>)}</select></label> : null}
                    {kind === "quantity" ? <label><span className="text-[9px] font-bold uppercase tracking-[0.07em] text-[#756960]">Corrective direction</span><select value={quantityDirection} onChange={(event) => {
                      const direction = event.target.value as QuantityDirection;
                      const linkedSource = discrepancies.find((candidate) => candidate.bucket === (direction === "add" ? "missing" : "excess"));
                      setQuantityDirection(direction);
                      setQuantity(linkedSource?.quantity ?? 1);
                    }} className={`${CONTROL} mt-1 w-full bg-white`}><option value="add">{discrepancies.some((candidate) => candidate.bucket === "missing") ? "Recover missing units and close the difference" : "Add units to sellable stock"}</option><option value="remove">{discrepancies.some((candidate) => candidate.bucket === "excess") ? "Remove excess units and close the difference" : "Remove overcounted sellable units"}</option></select></label> : null}
                    {kind === "condition" ? <label><span className="text-[9px] font-bold uppercase tracking-[0.07em] text-[#756960]">Condition action</span><select value={conditionAction} onChange={(event) => { const value = event.target.value as ConditionAction; setConditionAction(value); if (value !== "move_to_hold" && !conditionSource) setConditionSource(sources[0]?.value ?? ""); }} className={`${CONTROL} mt-1 w-full bg-white`}><option value="move_to_hold" disabled={sellableRemaining <= 0}>Move recorded sellable stock to damaged hold</option><option value="restore_to_sellable" disabled={!sources.length}>Restore held stock to sellable</option><option value="return_to_brand" disabled={!sources.length}>Return held stock to brand</option><option value="write_off" disabled={!sources.length}>Write off held stock</option></select></label> : null}
                    {kind === "condition" && conditionAction !== "move_to_hold" ? <label><span className="text-[9px] font-bold uppercase tracking-[0.07em] text-[#756960]">Held-stock source</span><select value={conditionSource} onChange={(event) => { setConditionSource(event.target.value); const source = sources.find((candidate) => candidate.value === event.target.value); if (source) setQuantity(source.quantity); }} className={`${CONTROL} mt-1 w-full bg-white`}><option value="">Choose held stock…</option>{sources.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}</select></label> : null}
                    {kind === "close_discrepancy" ? <label><span className="text-[9px] font-bold uppercase tracking-[0.07em] text-[#756960]">Open difference</span><select value={discrepancySource} onChange={(event) => { setDiscrepancySource(event.target.value); const source = discrepancies.find((candidate) => candidate.bucket === event.target.value); if (source) setQuantity(source.quantity); }} className={`${CONTROL} mt-1 w-full bg-white`}><option value="">Choose a difference…</option>{discrepancies.map((source) => <option key={source.bucket} value={source.bucket}>{source.label}</option>)}</select></label> : null}
                    {kind !== "document_note" ? <label><span className="text-[9px] font-bold uppercase tracking-[0.07em] text-[#756960]">Quantity</span><input type="number" min={1} step={1} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.trunc(Number(event.target.value) || 1)))} className={`${CONTROL} mt-1 w-full bg-white font-bold tabular-nums`} /></label> : null}
                  </div>
                  {kind === "quantity" && discrepancies.some((candidate) => candidate.bucket === (quantityDirection === "add" ? "missing" : "excess")) ? <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-[9px] font-semibold leading-4 text-emerald-800">This correction will update sellable stock and close the linked receipt difference in the same atomic document.</p> : null}
                  <label className="mt-3 block"><span className="text-[9px] font-bold uppercase tracking-[0.07em] text-[#756960]">What was verified?</span><input value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder={kind === "document_note" ? "What information is wrong, and what should the approved record say?" : "What was recorded, what is physically correct, and how was it checked?"} className={`${CONTROL} mt-1 w-full bg-white`} /></label>
                  <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => saveIssue(item)} disabled={explanation.trim().length < 5} className="inline-flex h-10 items-center rounded-xl bg-[#C85956] px-4 text-[10.5px] font-bold text-white hover:bg-[#b84e4b] disabled:opacity-40"><Plus className="mr-1.5 h-3.5 w-3.5" />Add to review</button><button type="button" onClick={() => setEditingItemId(null)} className="h-10 px-3 text-[10px] font-bold text-[#756960]">Cancel</button></div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {!readOnly ? <div className="border-t border-[#ddd4cc] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold text-[#62564d]">{formatCount(drafts.length)} issue{drafts.length === 1 ? "" : "s"} ready for review</p><p className="mt-1 text-[9px] text-[#8d8076]">Original document: unchanged. Full Admin corrections apply immediately; delegated warehouse staff require independent approval.</p></div><button type="button" onClick={() => setReviewing(true)} disabled={!drafts.length} className="inline-flex h-11 items-center rounded-xl bg-[#C85956] px-5 text-[11px] font-bold text-white hover:bg-[#b84e4b] disabled:opacity-40"><ShieldCheck className="mr-2 h-4 w-4" />Review corrections · {formatCount(drafts.length)}</button></div>
        {reviewing ? <div className="mt-4 rounded-2xl bg-[#f8f4f0] p-4"><div className="flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-800"><PackageCheck className="h-4 w-4" /></span><div><h3 className="text-[13px] font-extrabold text-[#302924]">Correction review</h3><p className="mt-1 text-[10px] leading-5 text-[#756960]">These changes create one linked correction document without changing the original receipt. Full Admin corrections post immediately; delegated warehouse staff send it for independent approval.</p></div></div><div className="mt-3 space-y-2">{drafts.map((draft) => <div key={draft.id} className="flex flex-col gap-2 rounded-xl bg-white px-3 py-2.5 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="text-[10.5px] font-extrabold text-[#403730]">{draft.label}</p><p className="mt-1 text-[9.5px] text-[#756960]">{draft.preview}</p><p className="mt-1 text-[9px] text-[#94867c]">{draft.note}</p></div><button type="button" onClick={() => setDrafts((current) => current.filter((candidate) => candidate.id !== draft.id))} className="inline-flex h-8 items-center gap-1 px-2 text-[9px] font-bold text-red-700"><Trash2 className="h-3.5 w-3.5" />Remove</button></div>)}</div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={requestCorrection} disabled={busy || !drafts.length} className="inline-flex h-11 items-center rounded-xl bg-[#C85956] px-5 text-[11px] font-bold text-white hover:bg-[#b84e4b] disabled:opacity-45">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}{busy ? "Creating…" : "Submit correction"}</button><button type="button" onClick={() => setReviewing(false)} disabled={busy} className="h-11 px-3 text-[10px] font-bold text-[#62564d]">Back to document</button></div></div> : null}
      </div> : null}

    </section>
  );
}

function StaticMetric({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return <span className={`flex h-12 min-w-[68px] flex-col items-center justify-center rounded-xl px-2 ${warning ? "bg-amber-50" : "bg-[#f7f3ef]"}`}><span className={`text-[12px] font-extrabold tabular-nums ${warning ? "text-amber-900" : "text-[#403730]"}`}>{formatCount(value)}</span><span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.05em] text-[#8d8076]">{label}</span></span>;
}
