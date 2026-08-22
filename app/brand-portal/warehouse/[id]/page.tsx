import { notFound, redirect } from "next/navigation";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getWarehouseReceiptVariantOptions, getWarehouseTransferById } from "@/lib/data/warehouse";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import WarehouseCorrectionWorkspace from "@/components/admin/warehouse/WarehouseCorrectionWorkspace";
import TransferReceiveForm from "@/components/admin/warehouse/TransferReceiveForm";
import BrandReturnDeliveryConfirmation from "@/components/brand-portal/warehouse/BrandReturnDeliveryConfirmation";
import WarehouseDocumentHistory from "@/components/warehouse/WarehouseDocumentHistory";
import WarehouseDocumentHeader from "@/components/warehouse/WarehouseDocumentHeader";
import WarehouseReceiptHistory from "@/components/warehouse/WarehouseReceiptHistory";
import PrintWarehouseDocumentButton from "@/components/admin/warehouse/PrintWarehouseDocumentButton";
import { CancelWarehouseRequestButton } from "@/components/warehouse/WarehouseDocumentLifecycleActions";

export default async function BrandPortalWarehouseDocumentPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ brand?: string }>;
}) {
  const [{ id }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const owner = await requireBrandOwner(searchParams.brand);
  if (!owner) redirect(`/account?next=${encodeURIComponent(`/brand-portal/warehouse/${id}`)}`);
  if (!owner.brandId || !owner.brandSlug) redirect("/brand-portal/warehouse");

  const transfer = await getWarehouseTransferById(id);
  if (!transfer || transfer.brandId !== owner.brandId || !owner.isMahalyPartner) notFound();
  const variants = await getWarehouseReceiptVariantOptions(owner.brandId);
  const brandQuery = owner.isImpersonating ? `?brand=${encodeURIComponent(owner.brandSlug)}` : "";
  // This client workspace never receives staff/owner email addresses. Actor
  // details remain available only to the server-rendered Admin history.
  const publicActor = (actor: typeof transfer.requestedByActor) => actor
    ? { ...actor, displayName: actor.isStaff ? "Zakhnook Staff Team" : actor.displayName, email: null, roleLabel: actor.isStaff ? "Zakhnook staff" : actor.roleLabel }
    : null;
  const publicCorrections = transfer.corrections.map((correction) => ({
    ...correction,
    requestedByActor: publicActor(correction.requestedByActor),
    approvedByActor: publicActor(correction.approvedByActor),
    rejectedByActor: publicActor(correction.rejectedByActor),
  }));
  const awaitingBrandReturnConfirmation = transfer.direction === "to_brand" && ["in_transit", "partially_received"].includes(transfer.status);
  const canConfirmReturn = awaitingBrandReturnConfirmation && owner.accessLevel === "owner" && !owner.isImpersonating;
  const returnRequestPreview = transfer.direction === "to_brand" && ["pending", "submitted", "approved"].includes(transfer.status);
  const requestOnlyPreview = returnRequestPreview || transfer.status === "cancelled";

  return <div>
    {owner.isImpersonating ? <AdminViewingBanner brandName={owner.brandName!} /> : null}
    <div className={owner.isImpersonating ? "mt-5" : ""}>
      <WarehouseDocumentHeader transfer={transfer} backHref={`/brand-portal/warehouse${brandQuery}`} backLabel="All warehouse documents" actions={<>{transfer.status === "pending" && owner.accessLevel === "owner" && !owner.isImpersonating ? <CancelWarehouseRequestButton transferId={transfer.id} isReturn={transfer.direction === "to_brand"} /> : null}<PrintWarehouseDocumentButton /></>} />

      <div className="space-y-4">
        {transfer.brandNote ? <section className="rounded-[18px] bg-[#f7f3ef] px-4 py-3"><p className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#756960]">Brand note</p><p className="mt-1.5 text-[11.5px] leading-5 text-[#403730]">{transfer.brandNote}</p></section> : null}
        {transfer.receivingNote ? <section className={`rounded-[18px] px-4 py-3 ${transfer.brandDeliveryNoteReviewedAt ? "bg-emerald-50 text-emerald-950" : "bg-amber-50 text-amber-950"}`}><p className="text-[9.5px] font-bold uppercase tracking-[0.07em]">Delivery confirmation note · {transfer.brandDeliveryNoteReviewedAt ? "Reviewed by Zakhnook" : "Zakhnook is reviewing"}</p><p className="mt-1.5 text-[11.5px] leading-5">{transfer.receivingNote}</p><p className="mt-2 text-[9.5px] opacity-75">{transfer.brandDeliveryNoteReviewedAt ? "This follow-up is complete. The note remains attached to the document." : "Zakhnook will contact you if any follow-up is needed."}</p></section> : null}
        {transfer.status === "pending" && owner.accessLevel === "owner" && !owner.isImpersonating ? <section className="rounded-[18px] bg-[#f7f3ef] px-4 py-3"><p className="text-[11px] font-extrabold text-[#403730]">Waiting for Zakhnook acceptance</p><p className="mt-1 text-[10px] leading-4 text-[#756960]">You can cancel this request until Zakhnook accepts it.</p></section> : null}
        {transfer.status === "approved" ? <section className="rounded-[18px] bg-sky-50 px-4 py-3 text-sky-900"><p className="text-[11px] font-extrabold">{transfer.direction === "to_brand" ? "Preparing return" : "Accepted · awaiting arrival"}</p><p className="mt-1 text-[10px] leading-4">{transfer.direction === "to_brand" ? "Zakhnook accepted your request. The units are on return hold and are being prepared for dispatch to your brand." : "Zakhnook is expecting this delivery. The request can no longer be cancelled, and stock will change only after physical receipt."}</p></section> : null}
        {awaitingBrandReturnConfirmation ? <section className="rounded-[18px] bg-sky-50 px-4 py-3 text-sky-900"><p className="text-[11px] font-extrabold">In transit to your brand</p><p className="mt-1 text-[10px] leading-4">The return has physically left Zakhnook. Check the expected quantities below, then confirm only when the shipment has arrived.</p></section> : null}
        {canConfirmReturn ? <BrandReturnDeliveryConfirmation transferId={transfer.id} items={transfer.items} /> : awaitingBrandReturnConfirmation ? <><section className="rounded-[18px] bg-amber-50 px-4 py-3 text-amber-900"><p className="text-[11px] font-extrabold">Brand Owner confirmation required</p><p className="mt-1 text-[10px] leading-4">Assistants and admin impersonation can review the expected shipment, but only the real Brand Owner can confirm that it arrived.</p></section><TransferReceiveForm transferId={transfer.id} items={transfer.items} variantOptions={variants} brandSlug={transfer.brandSlug} receiptItemIds={[]} receivable={false} showLedger={false} isReturn previewOnly /></> : requestOnlyPreview ? <TransferReceiveForm transferId={transfer.id} items={transfer.items} variantOptions={variants} brandSlug={transfer.brandSlug} receiptItemIds={[]} receivable={false} showLedger={false} isReturn={transfer.direction === "to_brand"} previewOnly /> : <WarehouseCorrectionWorkspace transferId={transfer.id} items={transfer.items} variants={variants} corrections={publicCorrections} receipts={transfer.receipts} brandSlug={transfer.brandSlug} readOnly isReturn={transfer.direction === "to_brand"} />}
        {transfer.receipts.length && transfer.status !== "received" ? <WarehouseReceiptHistory receipts={transfer.receipts} variants={variants} items={transfer.items} /> : null}
        <WarehouseDocumentHistory transfer={transfer} variants={variants} canRevealActorIdentity={false} />
      </div>
    </div>
  </div>;
}
