import { notFound } from "next/navigation";
import {
  getWarehouseReceiptVariantOptions,
  getWarehouseTransferById,
  type WarehouseTransferRow,
} from "@/lib/data/warehouse";
import { getAuditLogsForEntity } from "@/lib/data/admin";
import TransferReceiveForm from "@/components/admin/warehouse/TransferReceiveForm";
import ReturnDispatchForm from "@/components/admin/warehouse/ReturnDispatchForm";
import PrintWarehouseDocumentButton from "@/components/admin/warehouse/PrintWarehouseDocumentButton";
import WarehouseCorrectionWorkspace from "@/components/admin/warehouse/WarehouseCorrectionWorkspace";
import WarehouseDocumentHistory from "@/components/warehouse/WarehouseDocumentHistory";
import WarehouseDocumentHeader from "@/components/warehouse/WarehouseDocumentHeader";
import WarehouseReceiptHistory from "@/components/warehouse/WarehouseReceiptHistory";
import { AcceptWarehouseRequestButton } from "@/components/warehouse/WarehouseDocumentLifecycleActions";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import BrandDeliveryNoteReviewCard from "@/components/admin/warehouse/BrandDeliveryNoteReviewCard";

const RECEIVABLE_STATUSES = new Set<WarehouseTransferRow["status"]>(["approved", "in_transit", "partially_received"]);

export default async function AdminWarehouseTransferPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const transfer = await getWarehouseTransferById(params.id);
  if (!transfer) notFound();
  const [auditLogs, variantOptions, fullAdmin] = await Promise.all([
    getAuditLogsForEntity("warehouse_transfer", params.id),
    getWarehouseReceiptVariantOptions(transfer.brandId),
    requireStaffRole("admin"),
  ]);

  const isReturn = transfer.direction === "to_brand";
  const receivable = !isReturn
    && RECEIVABLE_STATUSES.has(transfer.status)
    && transfer.items.some((item) => item.receivedOkQty == null);

  return (
    <div>
      <WarehouseDocumentHeader transfer={transfer} backHref="/admin/warehouse" backLabel="All requests" actions={<>{["pending", "submitted"].includes(transfer.status) ? <AcceptWarehouseRequestButton transferId={transfer.id} expectedArrivalAt={transfer.expectedArrivalAt} isReturn={isReturn} /> : null}<PrintWarehouseDocumentButton /></>} />

      <div className="space-y-4">
        {transfer.brandNote ? <section className="rounded-[18px] bg-[#f7f3ef] px-4 py-3"><p className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#756960]">Brand note</p><p className="mt-1.5 text-[11.5px] leading-5 text-[#403730]">{transfer.brandNote}</p></section> : null}
        {transfer.receivingNote ? <BrandDeliveryNoteReviewCard transferId={transfer.id} note={transfer.receivingNote} reviewedAt={transfer.brandDeliveryNoteReviewedAt} reviewedBy={fullAdmin ? transfer.brandDeliveryNoteReviewedByActor?.displayName ?? null : null} /> : null}

        {transfer.status === "received" ? (
          <WarehouseCorrectionWorkspace
            transferId={transfer.id}
            items={transfer.items}
            variants={variantOptions}
            corrections={transfer.corrections}
            receipts={transfer.receipts}
            brandSlug={transfer.brandSlug}
            isReturn={isReturn}
          />
        ) : isReturn && transfer.status === "approved" ? (
          <>
            <section className="rounded-[20px] bg-sky-50 px-5 py-4 text-sky-900"><p className="text-[12px] font-extrabold">Preparing return at Zakhnook</p><p className="mt-1 text-[10.5px]">The units remain on return hold. Count and complete every Document line below before the package can be dispatched.</p></section>
            <ReturnDispatchForm transferId={transfer.id} items={transfer.items} />
          </>
        ) : isReturn && ["in_transit", "partially_received"].includes(transfer.status) ? (
          <>
            <section className="rounded-[20px] bg-sky-50 px-5 py-4 text-sky-900"><p className="text-[12px] font-extrabold">Waiting for brand delivery confirmation</p><p className="mt-1 text-[10.5px]">The package has left Zakhnook and stays In transit to brand. The Brand Owner can only confirm that it arrived and leave an optional note; quantities cannot be edited.</p></section>
            <TransferReceiveForm transferId={transfer.id} items={transfer.items} variantOptions={variantOptions} brandSlug={transfer.brandSlug} receiptItemIds={transfer.receipts.flatMap((receipt) => receipt.lines.map((line) => line.expectedTransferItemId))} receivable={false} showLedger={false} isReturn previewOnly showDispatchedQuantity />
          </>
        ) : receivable || (!isReturn && ["partially_received", "rejected"].includes(transfer.status)) ? (
          <TransferReceiveForm
            transferId={transfer.id}
            items={transfer.items}
            variantOptions={variantOptions}
            brandSlug={transfer.brandSlug}
            receiptItemIds={transfer.receipts.flatMap((receipt) => receipt.lines.map((line) => line.expectedTransferItemId))}
            receivable={receivable}
            showLedger={["partially_received", "rejected"].includes(transfer.status)}
            isReturn={isReturn}
          />
        ) : ["pending", "submitted"].includes(transfer.status) ? (
          <>
            <section className="rounded-[20px] bg-[#f7f3ef] px-5 py-4"><p className="text-[12px] font-extrabold text-[#403730]">Review the request before accepting</p><p className="mt-1 text-[10.5px] leading-4 text-[#756960]">{isReturn ? "Check every Variant and requested return quantity below. These units left available stock when the request was submitted and are already on Return hold at Zakhnook." : "Check every Variant and requested delivery quantity below. Acceptance confirms that Zakhnook is expecting it; stock changes only after the physical receipt is reviewed."}</p></section>
            <TransferReceiveForm
              transferId={transfer.id}
              items={transfer.items}
              variantOptions={variantOptions}
              brandSlug={transfer.brandSlug}
              receiptItemIds={[]}
              receivable={false}
              showLedger={false}
              isReturn={isReturn}
              previewOnly
            />
          </>
        ) : transfer.status === "approved" ? (
          <>
            <section className="rounded-[20px] bg-sky-50 px-5 py-4 text-sky-900"><p className="text-[12px] font-extrabold">Accepted · awaiting physical arrival</p><p className="mt-1 text-[10.5px]">The request is ready for receipt. No inventory has been added yet.</p></section>
          </>
        ) : transfer.status === "cancelled" ? (
          <>
            <section className="rounded-[20px] bg-[#f7f3ef] px-5 py-4"><p className="text-[12px] font-extrabold text-[#403730]">Cancelled request · historical document</p><p className="mt-1 text-[10.5px] leading-4 text-[#756960]">The request is closed, but every originally requested Variant and quantity remains visible below.</p></section>
            <TransferReceiveForm transferId={transfer.id} items={transfer.items} variantOptions={variantOptions} brandSlug={transfer.brandSlug} receiptItemIds={[]} receivable={false} showLedger={false} isReturn={isReturn} previewOnly />
          </>
        ) : null}
        {transfer.status === "receiving" ? <section className="rounded-[20px] bg-violet-50 px-5 py-4 text-violet-900"><p className="text-[12px] font-extrabold">Receiving is already in progress</p><p className="mt-1 text-[10.5px]">Wait for the active warehouse operation to finish before reconciling another group of variants.</p></section> : null}

        {transfer.receipts.length && transfer.status !== "received" ? <WarehouseReceiptHistory receipts={transfer.receipts} variants={variantOptions} items={transfer.items} /> : null}
        <WarehouseDocumentHistory transfer={transfer} variants={variantOptions} logs={auditLogs} canRevealActorIdentity={Boolean(fullAdmin)} />
      </div>
    </div>
  );
}
