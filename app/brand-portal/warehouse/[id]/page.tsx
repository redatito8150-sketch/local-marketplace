import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getWarehouseReceiptVariantOptions, getWarehouseTransferById } from "@/lib/data/warehouse";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import WarehouseCorrectionWorkspace from "@/components/admin/warehouse/WarehouseCorrectionWorkspace";
import WarehouseDocumentHistory from "@/components/warehouse/WarehouseDocumentHistory";
import { TonePill } from "@/components/admin/inventory/shared";
import { WAREHOUSE_STATUS_META, warehouseDocumentLabel } from "@/components/admin/warehouse/warehouseUi";
import { formatDateTime } from "@/lib/format";

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
  const statusMeta = WAREHOUSE_STATUS_META[transfer.status];

  return <div>
    {owner.isImpersonating ? <AdminViewingBanner brandName={owner.brandName!} /> : null}
    <header className="mb-4 rounded-[22px] bg-[#ece7e0] px-5 py-4 shadow-[0_12px_32px_rgba(72,50,36,.07)]">
      <Link href={`/brand-portal/warehouse${brandQuery}`} className="mb-2 inline-flex w-fit items-center gap-1 text-[9.5px] font-semibold text-[#756960] transition-colors hover:text-[#C85956] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25"><ArrowLeft className="h-3 w-3" />All warehouse documents</Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1"><p className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#C85956]">{warehouseDocumentLabel(transfer.direction)}</p><h1 className="mt-0.5 truncate text-[18px] font-extrabold text-[#302924]">{transfer.documentNumber ?? `Legacy · ${transfer.id.slice(0, 8).toUpperCase()}`}</h1><p className="mt-1 text-[10.5px] text-[#756960]">Requested {formatDateTime(transfer.requestedAt)}</p></div>
        <TonePill label={statusMeta.label} tone={statusMeta.tone} icon={statusMeta.icon} />
      </div>
    </header>

    <div className="space-y-4">
      {transfer.brandNote ? <section className="rounded-[18px] bg-[#f7f3ef] px-4 py-3"><p className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#756960]">Brand note</p><p className="mt-1.5 text-[11.5px] leading-5 text-[#403730]">{transfer.brandNote}</p></section> : null}
      <WarehouseCorrectionWorkspace transferId={transfer.id} items={transfer.items} variants={variants} corrections={transfer.corrections} receipts={transfer.receipts} brandSlug={transfer.brandSlug} readOnly />
      <WarehouseDocumentHistory transfer={transfer} variants={variants} />
    </div>
  </div>;
}
