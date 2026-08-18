import { CheckCircle2, Circle, Clock3 } from "lucide-react";
import type { WarehouseReceiptVariantOption, WarehouseTransferRow } from "@/lib/data/warehouse";
import { formatDateTime } from "@/lib/format";
import { titleCase } from "@/components/admin/inventory/shared";
import { WAREHOUSE_STATUS_META } from "@/components/admin/warehouse/warehouseUi";
import { buildWarehouseVariantLabels, describeWarehouseCorrectionLine } from "@/components/warehouse/warehouseCorrectionPresentation";

type AuditEntry = {
  id: string;
  action: string;
  createdAt: string;
  actorName?: string | null;
  actorLabel: string;
};

type DocumentActivityEntry = { id: string; label: string; timestamp: string; detail: string };

export default function WarehouseDocumentHistory({
  transfer,
  variants,
  logs = [],
}: {
  transfer: WarehouseTransferRow;
  variants: WarehouseReceiptVariantOption[];
  logs?: AuditEntry[];
}) {
  const variantLabels = buildWarehouseVariantLabels(variants);
  const createLog = logs.find((log) => log.action.toLowerCase().includes("create"));
  const finalAction = transfer.status === "received" || transfer.status === "partially_received" ? "receiv" : transfer.status === "rejected" ? "reject" : transfer.status === "cancelled" ? "cancel" : null;
  const finalLog = finalAction ? logs.find((log) => log.action.toLowerCase().includes(finalAction)) : undefined;
  const workflowOnlyLogs = logs.filter((log) => ["approv", "review", "transit", "submit"].some((action) => log.action.toLowerCase().includes(action)));
  const claimedLogIds = new Set([createLog?.id, finalLog?.id, ...workflowOnlyLogs.map((log) => log.id)].filter((id): id is string => Boolean(id)));
  const activity: DocumentActivityEntry[] = [{
    id: "requested",
    label: "Requested",
    timestamp: transfer.requestedAt,
    detail: `Requested by ${transfer.requestedByEmail ?? "Brand team"}${createLog ? ` · Recorded by ${createLog.actorName ?? createLog.actorLabel}` : ""}`,
  }];

  for (const log of logs) {
    if (claimedLogIds.has(log.id)) continue;
    activity.push({ id: `audit-${log.id}`, label: titleCase(log.action), timestamp: log.createdAt, detail: `Recorded by ${log.actorName ?? log.actorLabel}` });
  }

  if (transfer.decidedAt) {
    const outcomeLabel = transfer.status === "received" ? "Accepted" : transfer.status === "partially_received" ? "Accepted with differences" : WAREHOUSE_STATUS_META[transfer.status].label;
    activity.push({
      id: "decision",
      label: outcomeLabel,
      timestamp: transfer.decidedAt,
      detail: `${outcomeLabel} by ${transfer.decidedByEmail ?? finalLog?.actorName ?? finalLog?.actorLabel ?? "Warehouse team"}`,
    });
  }

  for (const correction of transfer.corrections) {
    const summary = correction.lines.map((line) => describeWarehouseCorrectionLine(line, variantLabels)).join(" · ");
    const requestDetail = `${correction.correctionNumber} · ${summary || correction.note} · Requested by ${correction.requestedByLabel ?? "Administrator"}`;
    if (correction.approvalMode === "admin_auto" && correction.status === "posted") {
      activity.push({
        id: `correction-${correction.id}-auto`,
        label: "Correction requested and applied",
        timestamp: correction.postedAt ?? correction.requestedAt,
        detail: `${correction.correctionNumber} · ${summary || correction.note} · Applied immediately by ${correction.approvedByLabel ?? correction.requestedByLabel ?? "Administrator"}`,
      });
      continue;
    }

    activity.push({ id: `correction-${correction.id}-requested`, label: "Correction requested", timestamp: correction.requestedAt, detail: requestDetail });
    if (correction.status === "posted") {
      activity.push({ id: `correction-${correction.id}-posted`, label: "Correction approved and applied", timestamp: correction.postedAt ?? correction.approvedAt ?? correction.requestedAt, detail: `${correction.correctionNumber} · Approved by ${correction.approvedByLabel ?? "Administrator"}` });
    } else if (correction.status === "rejected") {
      activity.push({ id: `correction-${correction.id}-rejected`, label: "Correction rejected", timestamp: correction.approvedAt ?? correction.requestedAt, detail: `${correction.correctionNumber} · Rejected by ${correction.rejectedByLabel ?? "Administrator"}${correction.rejectionNote ? ` · ${correction.rejectionNote}` : ""}` });
    } else if (correction.status === "reversed") {
      activity.push({ id: `correction-${correction.id}-reversed`, label: "Correction reversed", timestamp: correction.postedAt ?? correction.approvedAt ?? correction.requestedAt, detail: `${correction.correctionNumber} · Recorded by ${correction.approvedByLabel ?? "Administrator"}` });
    }
  }

  activity.sort((first, second) => Date.parse(first.timestamp) - Date.parse(second.timestamp));

  return <section aria-label="Document history" className="overflow-hidden rounded-[22px] border border-[#e6ded7] bg-white shadow-[0_10px_30px_rgba(72,50,36,.045)]">
    <header className="flex items-center justify-between gap-4 border-b border-[#ddd4cc] px-5 py-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#C85956]">Document history</p><h2 className="mt-1 text-[14px] font-extrabold text-[#302924]">Request, outcome and audit trail</h2></div><Clock3 className="h-4 w-4 text-[#9b8e84]" /></header>
    <ol className="px-5 py-5">{activity.map((entry, index) => { const latest = index === activity.length - 1; return <li key={entry.id} className="grid grid-cols-[20px_1fr] gap-3"><div className="flex flex-col items-center"><span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full ${latest ? "bg-[#C85956] text-white" : "bg-[#e2dcd4] text-[#8a7d73]"}`}>{latest ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-2.5 w-2.5 fill-current" />}</span>{index < activity.length - 1 ? <span className="min-h-8 w-px flex-1 bg-[#d8cec6]" /> : null}</div><div className="pb-4 last:pb-0"><p className="text-[11.5px] font-extrabold text-[#403730]">{entry.label}</p><p className="mt-0.5 text-[9.5px] text-[#94867c]">{formatDateTime(entry.timestamp)}</p><p className="mt-1 text-[10.5px] leading-4 text-[#756960]">{entry.detail}</p></div></li>; })}</ol>
  </section>;
}
