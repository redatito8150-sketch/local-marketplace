import type { ReactNode } from "react";
import { CheckCircle2, Circle, Clock3 } from "lucide-react";
import type { WarehouseActorIdentity, WarehouseReceiptVariantOption, WarehouseTransferRow } from "@/lib/data/warehouse";
import { formatDateTime } from "@/lib/format";
import { warehouseStatusMeta } from "@/components/admin/warehouse/warehouseUi";
import WarehouseActorLabel from "@/components/warehouse/WarehouseActorLabel";

type AuditEntry = {
  id: string;
  action: string;
  createdAt: string;
  actorName?: string | null;
  actorLabel: string;
  actorIsStaff?: boolean;
  actorRoleLabel?: string;
  beforeValue?: unknown;
  afterValue?: unknown;
};

type DocumentActivityEntry = { id: string; label: string; timestamp: string; detail: ReactNode };

function objectKeys(value: unknown): string[] {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
}

function auditTitle(log: AuditEntry): string {
  const keys = objectKeys(log.afterValue);
  const values = log.afterValue && typeof log.afterValue === "object" ? Object.values(log.afterValue as Record<string, unknown>).map(String) : [];
  if (keys.some((key) => key.toLowerCase().includes("cancel"))) return "Request cancelled";
  if (keys.some((key) => key.toLowerCase().includes("stock received"))) return "Receipt recorded";
  if (keys.some((key) => key.toLowerCase().includes("stock returned"))) return "Return recorded";
  if (keys.some((key) => key.toLowerCase().includes("discrep"))) return "Receipt differences recorded";
  if (keys.some((key) => key.toLowerCase().includes("note"))) return "Document note updated";
  if (log.action.toLowerCase().includes("reject")) return "Request rejected";
  if (log.action.toLowerCase().includes("cancel")) return "Request cancelled";
  if (values.some((value) => value.toLowerCase().includes("in transit to brand"))) return "Dispatched to brand";
  return "Document updated";
}

function isCorrectionAudit(log: AuditEntry): boolean {
  return objectKeys(log.afterValue).some((key) => key.toLowerCase().includes("correction"));
}

function actorFromAudit(log: AuditEntry | undefined): WarehouseActorIdentity | null {
  if (!log) return null;
  return {
    id: log.id,
    displayName: log.actorName?.trim() || log.actorLabel.split("@")[0] || "Team member",
    email: log.actorLabel.includes("@") ? log.actorLabel : null,
    isStaff: Boolean(log.actorIsStaff),
    roleLabel: log.actorRoleLabel ?? (log.actorIsStaff ? "Zakhnook staff" : "Brand member"),
  };
}

function actorForViewer(actor: WarehouseActorIdentity | null, canReveal: boolean): WarehouseActorIdentity | null {
  if (!actor || canReveal) return actor;
  if (actor.isStaff) return { ...actor, displayName: "Zakhnook Staff Team", email: null, roleLabel: "Zakhnook staff" };
  return { ...actor, email: null };
}

function ActorLabel({ actor, canReveal }: { actor: WarehouseActorIdentity | null; canReveal: boolean }) {
  return <WarehouseActorLabel actor={actorForViewer(actor, canReveal)} canReveal={canReveal} />;
}

export default function WarehouseDocumentHistory({
  transfer,
  variants: _variants,
  logs = [],
  canRevealActorIdentity = false,
}: {
  transfer: WarehouseTransferRow;
  variants: WarehouseReceiptVariantOption[];
  logs?: AuditEntry[];
  canRevealActorIdentity?: boolean;
}) {
  const createLog = logs.find((log) => log.action.toLowerCase().includes("create"));
  const approvalLog = logs.find((log) => log.action.toLowerCase().includes("approv") && objectKeys(log.afterValue).some((key) => key.toLowerCase() === "status"));
  const finalAction = transfer.status === "received" || transfer.status === "partially_received" ? "receiv" : transfer.status === "rejected" ? "reject" : transfer.status === "cancelled" ? "cancel" : null;
  const finalLog = finalAction ? logs.find((log) => log.action.toLowerCase().includes(finalAction) || objectKeys(log.afterValue).some((key) => key.toLowerCase().includes(finalAction))) : undefined;
  const brandDeliveryNoteReviewLog = logs.find((log) => objectKeys(log.afterValue).some((key) => key.toLowerCase().includes("brand delivery note review")));
  const claimedLogIds = new Set([createLog?.id, approvalLog?.id, finalLog?.id, brandDeliveryNoteReviewLog?.id].filter((id): id is string => Boolean(id)));
  const requestedActor = transfer.requestedByActor ?? actorFromAudit(createLog);
  const activity: DocumentActivityEntry[] = [{
    id: "requested",
    label: "Requested",
    timestamp: transfer.requestedAt,
    detail: <>Requested by <ActorLabel actor={requestedActor} canReveal={canRevealActorIdentity} />{transfer.expectedArrivalAt ? <> · expected {formatDateTime(transfer.expectedArrivalAt)}</> : null}</>,
  }];

  if (transfer.approvedAt) {
    activity.push({
      id: "accepted",
      label: transfer.direction === "to_brand" ? "Preparing return" : "Request accepted",
      timestamp: transfer.approvedAt,
      detail: <>Accepted by <ActorLabel actor={transfer.approvedByActor ?? actorFromAudit(approvalLog)} canReveal={canRevealActorIdentity} /> · no stock movement</>,
    });
  }

  const dispatchLog = transfer.direction === "to_brand" ? logs.find((log) => {
    const values = log.afterValue && typeof log.afterValue === "object" ? Object.values(log.afterValue as Record<string, unknown>).map(String) : [];
    return values.some((value) => value.toLowerCase().includes("in transit to brand"));
  }) : undefined;
  if (dispatchLog) {
    claimedLogIds.add(dispatchLog.id);
    activity.push({ id: "dispatched", label: "In transit to brand", timestamp: dispatchLog.createdAt, detail: <>Dispatched by <ActorLabel actor={actorFromAudit(dispatchLog)} canReveal={canRevealActorIdentity} /> · no sellable change</> });
  }

  for (const log of logs) {
    if (claimedLogIds.has(log.id) || isCorrectionAudit(log) || ["approv", "review", "transit", "submit"].some((action) => log.action.toLowerCase().includes(action))) continue;
    activity.push({ id: `audit-${log.id}`, label: auditTitle(log), timestamp: log.createdAt, detail: <>By <ActorLabel actor={actorFromAudit(log)} canReveal={canRevealActorIdentity} /></> });
  }

  if (transfer.decidedAt) {
    const outcomeLabel = warehouseStatusMeta(transfer.status, transfer.direction).label;
    activity.push({ id: "decision", label: outcomeLabel, timestamp: transfer.decidedAt, detail: <>{outcomeLabel} by <ActorLabel actor={transfer.decidedByActor ?? actorFromAudit(finalLog)} canReveal={canRevealActorIdentity} /></> });
  }

  if (transfer.brandDeliveryNoteReviewedAt) {
    activity.push({
      id: "brand-delivery-note-reviewed",
      label: "Brand note follow-up completed",
      timestamp: transfer.brandDeliveryNoteReviewedAt,
      detail: <>Marked done by <ActorLabel actor={transfer.brandDeliveryNoteReviewedByActor ?? actorFromAudit(brandDeliveryNoteReviewLog)} canReveal={canRevealActorIdentity} /> · note retained</>,
    });
  }

  for (const correction of transfer.corrections) {
    const actor = correction.status === "rejected" ? correction.rejectedByActor ?? correction.requestedByActor : correction.status === "posted" ? correction.approvedByActor ?? correction.requestedByActor : correction.requestedByActor;
    const label = correction.status === "pending_approval" ? "Correction requested" : correction.status === "posted" ? "Correction applied" : correction.status === "rejected" ? "Correction rejected" : "Correction reversed";
    const timestamp = correction.status === "posted" ? correction.postedAt ?? correction.approvedAt ?? correction.requestedAt : correction.status === "rejected" || correction.status === "reversed" ? correction.approvedAt ?? correction.requestedAt : correction.requestedAt;
    activity.push({ id: `correction-${correction.id}`, label, timestamp, detail: <><a href={`#warehouse-correction-${correction.id}`} className="font-extrabold text-[#C85956] hover:underline">{correction.correctionNumber}</a> by <ActorLabel actor={actor} canReveal={canRevealActorIdentity} /></> });
  }

  activity.sort((first, second) => Date.parse(first.timestamp) - Date.parse(second.timestamp));

  return <section aria-label="Document history" className="overflow-hidden rounded-[22px] border border-[#e6ded7] bg-white shadow-[0_10px_30px_rgba(72,50,36,.045)]">
    <header className="flex items-center justify-between gap-4 border-b border-[#ddd4cc] px-5 py-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#C85956]">Document history</p><h2 className="mt-1 text-[14px] font-extrabold text-[#302924]">Request, outcome and audit trail</h2></div><Clock3 className="h-4 w-4 text-[#9b8e84]" /></header>
    <ol className="px-5 py-5">{activity.map((entry, index) => { const latest = index === activity.length - 1; return <li key={entry.id} className="grid grid-cols-[20px_1fr] gap-3"><div className="flex flex-col items-center"><span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full ${latest ? "bg-[#C85956] text-white" : "bg-[#e2dcd4] text-[#8a7d73]"}`}>{latest ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-2.5 w-2.5 fill-current" />}</span>{index < activity.length - 1 ? <span className="min-h-8 w-px flex-1 bg-[#d8cec6]" /> : null}</div><div className="pb-4 last:pb-0"><p className="text-[11.5px] font-extrabold text-[#403730]">{entry.label}</p><p className="mt-0.5 text-[9.5px] text-[#94867c]">{formatDateTime(entry.timestamp)}</p><div className="mt-1 text-[10.5px] leading-4 text-[#756960]">{entry.detail}</div></div></li>; })}</ol>
  </section>;
}
