import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Activity } from "lucide-react";
import { getWarehouseTransferById } from "@/lib/data/warehouse";
import TransferReceiveForm from "@/components/admin/warehouse/TransferReceiveForm";
import { TonePill, VariantIdentity, formatCount } from "@/components/admin/inventory/shared";

const STATUS_TONE: Record<string, "amber" | "emerald" | "red"> = { pending: "amber", received: "emerald", rejected: "red" };

export default async function AdminWarehouseTransferPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const transfer = await getWarehouseTransferById(params.id);
  if (!transfer) notFound();

  const isReturn = transfer.direction === "to_brand";
  const brandSlug = encodeURIComponent(transfer.brandSlug);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 rounded-[22px] border-0 bg-[#ece7e0] px-5 py-4 shadow-[0_12px_32px_rgba(72,50,36,.07)] sm:flex-row sm:items-center">
        <Link href="/admin/warehouse" className="inline-flex h-9 w-fit items-center gap-1.5 rounded-xl border border-[#e6dbd3] px-3 text-[10.5px] font-bold text-[#62564d] hover:text-[#C85956]">
          <ArrowLeft className="h-3.5 w-3.5" />
          All requests
        </Link>
        <div className="sm:ml-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.09em] text-[#C85956]">{isReturn ? "Return request" : "Restock request"}</p>
          <h1 className="text-[16px] font-extrabold text-[#302924]">{transfer.brandName}</h1>
          <p className="mt-1 text-[10.5px] text-[#8d8076]">
            Requested {new Date(transfer.requestedAt).toLocaleString()}
            {transfer.requestedByEmail ? ` by ${transfer.requestedByEmail}` : ""}
          </p>
        </div>
        <div className="sm:ml-auto">
          <TonePill label={transfer.status[0].toUpperCase() + transfer.status.slice(1)} tone={STATUS_TONE[transfer.status] ?? "amber"} />
        </div>
      </div>
      {transfer.brandNote ? (
        <p className="mb-4 rounded-2xl bg-[#f7f3ef] px-4 py-3 text-[11.5px] text-[#5b5049]">
          <span className="font-bold text-[#403730]">Brand note: </span>
          {transfer.brandNote}
        </p>
      ) : null}
      {transfer.status === "pending" ? (
        <TransferReceiveForm transferId={transfer.id} items={transfer.items} isReturn={isReturn} />
      ) : (
        <OutcomePanel transfer={transfer} brandSlug={brandSlug} />
      )}
    </div>
  );
}

function OutcomePanel({ transfer, brandSlug }: { transfer: Awaited<ReturnType<typeof getWarehouseTransferById>> & object; brandSlug: string }) {
  return (
    <section className="overflow-hidden rounded-[22px] border-0 bg-[#ece7e0] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
      <header className="border-b border-[#eee7e1] px-5 py-4">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#C85956]">Outcome</p>
        <h2 className="mt-1 text-[14px] font-extrabold capitalize text-[#302924]">{transfer.status}</h2>
        {transfer.decidedAt && (
          <p className="mt-1 text-[10.5px] text-[#8d8076]">
            {new Date(transfer.decidedAt).toLocaleString()}
            {transfer.decidedByEmail ? ` by ${transfer.decidedByEmail}` : ""}
          </p>
        )}
        {transfer.receivingNote && <p className="mt-2 text-[11px] italic text-[#8d8076]">{transfer.receivingNote}</p>}
      </header>
      <div className="divide-y divide-[#eee7e1]">
        {transfer.items.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
            <VariantIdentity image={item.productImage} productName={item.productName} label={`${item.productName}${item.optionLabel ? ` — ${item.optionLabel}` : ""}`} sku={item.sku} />
            <div className="ml-auto text-right">
              <p className="text-[11px] font-bold text-[#403730]">Requested {formatCount(item.requestedQty)}</p>
              {item.receivedOkQty != null ? (
                <p className="text-[10px] text-[#8d8076]">
                  Received {formatCount(item.receivedOkQty)}
                  {(item.damagedQty ?? 0) > 0 ? `, damaged ${formatCount(item.damagedQty ?? 0)}` : ""}
                  {(item.missingQty ?? 0) > 0 ? `, missing ${formatCount(item.missingQty ?? 0)}` : ""}
                </p>
              ) : null}
            </div>
            <Link
              href={`/admin/inventory?view=activity&brand=${brandSlug}&variantId=${encodeURIComponent(item.variantId)}`}
              className="inline-flex items-center gap-1 rounded-lg bg-[#e6e0d8] px-2.5 py-1.5 text-[9.5px] font-bold text-[#5b5049] transition-colors hover:bg-[#242424] hover:text-white"
            >
              <Activity className="h-3 w-3" />
              View in ledger
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
