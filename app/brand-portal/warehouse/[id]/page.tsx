import { notFound, redirect } from "next/navigation";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getWarehouseReceiptVariantOptions, getWarehouseTransferById } from "@/lib/data/warehouse";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import WarehouseCorrectionWorkspace from "@/components/admin/warehouse/WarehouseCorrectionWorkspace";
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
  const publicCorrections = transfer.corrections.map((correction) => ({
    ...correction,
    requestedByActor: correction.requestedByActor ? { ...correction.requestedByActor, email: null } : null,
    approvedByActor: correction.approvedByActor ? { ...correction.approvedByActor, email: null } : null,
    rejectedByActor: correction.rejectedByActor ? { ...correction.rejectedByActor, email: null } : null,
  }));

  return <div>
    {owner.isImpersonating ? <AdminViewingBanner brandName={owner.brandName!} /> : null}
    <div className={owner.isImpersonating ? "mt-5" : ""}>
      <WarehouseDocumentHeader transfer={transfer} backHref={`/brand-portal/warehouse${brandQuery}`} backLabel="All warehouse documents" actions={<>{transfer.status === "pending" && owner.accessLevel === "owner" && !owner.isImpersonating ? <CancelWarehouseRequestButton transferId={transfer.id} /> : null}<PrintWarehouseDocumentButton /></>} />

      <div className="space-y-4">
        {transfer.brandNote ? <section className="rounded-[18px] bg-[#f7f3ef] px-4 py-3"><p className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#756960]">Brand note</p><p className="mt-1.5 text-[11.5px] leading-5 text-[#403730]">{transfer.brandNote}</p></section> : null}
        {transfer.status === "pending" && owner.accessLevel === "owner" && !owner.isImpersonating ? <section className="rounded-[18px] bg-[#f7f3ef] px-4 py-3"><p className="text-[11px] font-extrabold text-[#403730]">Waiting for Zakhnook acceptance</p><p className="mt-1 text-[10px] leading-4 text-[#756960]">You can cancel this request until Zakhnook accepts it.</p></section> : null}
        {transfer.status === "approved" ? <section className="rounded-[18px] bg-sky-50 px-4 py-3 text-sky-900"><p className="text-[11px] font-extrabold">Accepted · awaiting arrival</p><p className="mt-1 text-[10px] leading-4">Zakhnook is expecting this delivery. The request can no longer be cancelled, and stock will change only after physical receipt.</p></section> : null}
        <WarehouseCorrectionWorkspace transferId={transfer.id} items={transfer.items} variants={variants} corrections={publicCorrections} receipts={transfer.receipts} brandSlug={transfer.brandSlug} readOnly />
        {transfer.receipts.length && transfer.status !== "received" ? <WarehouseReceiptHistory receipts={transfer.receipts} variants={variants} items={transfer.items} /> : null}
        <WarehouseDocumentHistory transfer={transfer} variants={variants} canRevealActorIdentity={false} />
      </div>
    </div>
  </div>;
}
