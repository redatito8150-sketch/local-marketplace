import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import type { WarehouseTransferRow } from "@/lib/data/warehouse";
import { formatDateTime } from "@/lib/format";
import { BrandMark, TonePill } from "@/components/admin/inventory/shared";
import { WAREHOUSE_STATUS_META, warehouseDocumentLabel } from "@/components/admin/warehouse/warehouseUi";

export default function WarehouseDocumentHeader({
  transfer,
  backHref,
  backLabel,
  actions,
}: {
  transfer: WarehouseTransferRow;
  backHref: string;
  backLabel: string;
  actions?: ReactNode;
}) {
  const statusMeta = WAREHOUSE_STATUS_META[transfer.status];
  const documentNumber = transfer.documentNumber ?? `Legacy · ${transfer.id.slice(0, 8).toUpperCase()}`;
  const corrected = transfer.status === "received" && transfer.reconciliationStatus === "corrected";

  return <>
    <div className="mb-2 print:hidden">
      <Link href={backHref} className="inline-flex w-fit items-center gap-1 text-[9.5px] font-semibold text-[#756960] transition-colors hover:text-[#C85956] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25">
        <ArrowLeft className="h-3 w-3" />
        {backLabel}
      </Link>
    </div>
    <header className="mb-4 rounded-[22px] border border-[#e6ded7] bg-white px-4 py-4 shadow-[0_10px_30px_rgba(72,50,36,.045)] sm:px-5 print:border-0 print:shadow-none">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <BrandMark brand={{ name: transfer.brandName, logoImage: transfer.brandLogoImage }} />
        <div className="min-w-0">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#C85956]">{warehouseDocumentLabel(transfer.direction)}</p>
          <h1 className="mt-0.5 truncate text-[18px] font-extrabold text-[#302924]">{documentNumber}</h1>
          <p className="mt-1 text-[10.5px] text-[#756960]">{transfer.brandName} · Requested {formatDateTime(transfer.requestedAt)}</p>
          {transfer.expectedArrivalAt ? <p className="mt-0.5 text-[10px] font-semibold text-sky-800">Expected arrival {formatDateTime(transfer.expectedArrivalAt)}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <div className="flex flex-col items-start gap-1">
            <TonePill label={statusMeta.label} tone={statusMeta.tone} icon={statusMeta.icon} />
            {corrected ? <span className="pl-1 text-[8.5px] font-bold text-[#756960]">Corrected</span> : null}
          </div>
          {actions}
        </div>
      </div>
    </header>
  </>;
}
