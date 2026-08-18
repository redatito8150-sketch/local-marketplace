import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import {
  getWarehouseReceiptVariantOptions,
  getWarehouseTransferById,
  type WarehouseTransferRow,
} from "@/lib/data/warehouse";
import { getAuditLogsForEntity } from "@/lib/data/admin";
import TransferReceiveForm from "@/components/admin/warehouse/TransferReceiveForm";
import PrintWarehouseDocumentButton from "@/components/admin/warehouse/PrintWarehouseDocumentButton";
import WarehouseCorrectionWorkspace from "@/components/admin/warehouse/WarehouseCorrectionWorkspace";
import WarehouseDocumentHistory from "@/components/warehouse/WarehouseDocumentHistory";
import WarehouseDocumentHeader from "@/components/warehouse/WarehouseDocumentHeader";
import WarehouseReceiptHistory from "@/components/warehouse/WarehouseReceiptHistory";

const RECEIVABLE_STATUSES = new Set<WarehouseTransferRow["status"]>(["pending", "submitted", "approved", "in_transit", "partially_received"]);

export default async function AdminWarehouseTransferPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const transfer = await getWarehouseTransferById(params.id);
  if (!transfer) notFound();
  const [auditLogs, variantOptions] = await Promise.all([
    getAuditLogsForEntity("warehouse_transfer", params.id),
    getWarehouseReceiptVariantOptions(transfer.brandId),
  ]);

  const isReturn = transfer.direction === "to_brand";
  const receivable = RECEIVABLE_STATUSES.has(transfer.status) && transfer.items.some((item) => item.receivedOkQty == null);

  return (
    <div>
      <WarehouseDocumentHeader transfer={transfer} backHref="/admin/warehouse" backLabel="All requests" actions={<><PrintWarehouseDocumentButton /><Link href={`/brand-portal/warehouse/${transfer.id}?brand=${encodeURIComponent(transfer.brandSlug)}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#e6ded7] bg-[#f8f5f2] px-3 text-[10.5px] font-bold text-[#62564d] hover:bg-[#efe9e4] hover:text-[#302924] print:hidden">View brand portal<ExternalLink className="h-3 w-3" /></Link></>} />

      <div className="space-y-4">
        {transfer.brandNote ? <section className="rounded-[18px] bg-[#f7f3ef] px-4 py-3"><p className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#756960]">Brand note</p><p className="mt-1.5 text-[11.5px] leading-5 text-[#403730]">{transfer.brandNote}</p></section> : null}

        {transfer.status === "received" ? (
          <WarehouseCorrectionWorkspace
            transferId={transfer.id}
            items={transfer.items}
            variants={variantOptions}
            corrections={transfer.corrections}
            receipts={transfer.receipts}
            brandSlug={transfer.brandSlug}
          />
        ) : (
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
        )}
        {transfer.status === "receiving" ? <section className="rounded-[20px] bg-violet-50 px-5 py-4 text-violet-900"><p className="text-[12px] font-extrabold">Receiving is already in progress</p><p className="mt-1 text-[10.5px]">Wait for the active warehouse operation to finish before reconciling another group of variants.</p></section> : null}

        {transfer.receipts.length && transfer.status !== "received" ? <WarehouseReceiptHistory receipts={transfer.receipts} variants={variantOptions} items={transfer.items} /> : null}
        <WarehouseDocumentHistory transfer={transfer} variants={variantOptions} logs={auditLogs} />
      </div>
    </div>
  );
}
