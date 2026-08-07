import { notFound } from "next/navigation";
import { getWarehouseTransferById } from "@/lib/data/warehouse";
import { DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";
import TransferReceiveForm from "@/components/admin/warehouse/TransferReceiveForm";

export default async function AdminWarehouseTransferPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const transfer = await getWarehouseTransferById(params.id);
  if (!transfer) notFound();

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Local Warehouse"
        title={`${transfer.brandName} — Transfer request`}
        description={`Requested ${new Date(transfer.requestedAt).toLocaleString()}${transfer.requestedByEmail ? ` by ${transfer.requestedByEmail}` : ""}.${transfer.brandNote ? ` Note: ${transfer.brandNote}` : ""}`}
      />
      <div className="mt-6">
        {transfer.status === "pending" ? (
          <TransferReceiveForm transferId={transfer.id} items={transfer.items} />
        ) : (
          <DashboardPanel title="Outcome">
            <div className="px-5 py-4 text-[13px] text-slate-700">
              <p className="font-semibold capitalize">{transfer.status}</p>
              {transfer.decidedAt && (
                <p className="mt-1 text-slate-500">
                  {new Date(transfer.decidedAt).toLocaleString()}{transfer.decidedByEmail ? ` by ${transfer.decidedByEmail}` : ""}
                </p>
              )}
              {transfer.receivingNote && <p className="mt-2 italic text-slate-500">{transfer.receivingNote}</p>}
              <ul className="mt-4 space-y-1.5">
                {transfer.items.map((item) => (
                  <li key={item.id}>
                    {item.productName}{item.optionLabel ? ` — ${item.optionLabel}` : ""} ({item.sku}): requested {item.requestedQty}
                    {item.receivedOkQty != null && (
                      <span className="text-slate-500">
                        {" "}— received {item.receivedOkQty}
                        {(item.damagedQty ?? 0) > 0 ? `, damaged ${item.damagedQty}` : ""}
                        {(item.missingQty ?? 0) > 0 ? `, missing ${item.missingQty}` : ""}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </DashboardPanel>
        )}
      </div>
    </div>
  );
}
