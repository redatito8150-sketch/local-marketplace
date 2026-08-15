import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";
import { getInventoryMovementsForAdmin } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/format";
import AdminWorkspaceNav from "@/components/admin/AdminWorkspaceNav";

const PAGE_SIZE = 50;

export default async function AdminInventoryLedgerPage(props: {
  searchParams: Promise<{ productId?: string; page?: string }>;
}) {
  const params = await props.searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const result = await getInventoryMovementsForAdmin({
    productId: params.productId?.trim() || undefined,
    page,
    limit: PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  function pageHref(target: number) {
    const search = new URLSearchParams();
    if (params.productId) search.set("productId", params.productId);
    if (target > 1) search.set("page", String(target));
    return `/admin/inventory${search.size ? `?${search}` : ""}`;
  }

  return <div>
    <AdminWorkspaceNav workspace="inventory" activeHref="/admin/inventory" />
    <DashboardPageHeader
      eyebrow="Inventory audit"
      title={`Inventory ledger (${result.total})`}
      description={params.productId
        ? "Every immutable stock movement recorded for this product."
        : "The immutable history behind every stock balance and correction."}
      actions={params.productId ? <Link href="/admin/inventory" className="text-[12.5px] font-semibold text-[#C85956] hover:underline">View all movements</Link> : undefined}
    />

    <DashboardPanel className="mt-6">
      {result.rows.length ? <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-[12.5px]">
          <thead className="border-b border-slate-200 bg-slate-50/80 text-[10.5px] uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Product</th>
              <th className="px-5 py-3 font-semibold">Movement</th>
              <th className="px-5 py-3 font-semibold">Balance</th>
              <th className="px-5 py-3 font-semibold">Reason</th>
              <th className="px-5 py-3 font-semibold">Recorded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {result.rows.map((row) => <tr key={row.id} className="align-top hover:bg-slate-50/70">
              <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="relative block h-11 w-10 flex-none overflow-hidden rounded-lg bg-slate-100">
                    {row.productImage ? <Image src={row.productImage} alt={row.productName} fill sizes="40px" className="object-cover" /> : null}
                  </span>
                  <div className="min-w-0">
                    <Link href={`/admin/products/${row.productId}/edit`} className="font-bold text-slate-900 hover:text-[#C85956] hover:underline">{row.productName}</Link>
                    <p className="mt-0.5 text-[10.5px] text-slate-500">{row.brandName} · {row.variantSku}</p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-4">
                <span className={`font-bold ${row.quantityDelta > 0 ? "text-emerald-700" : row.quantityDelta < 0 ? "text-red-700" : "text-slate-600"}`}>
                  {row.quantityDelta > 0 ? "+" : ""}{row.quantityDelta} units
                </span>
                <p className="mt-1 text-[10.5px] capitalize text-slate-500">{row.movementType.replaceAll("_", " ")}</p>
              </td>
              <td className="px-5 py-4 font-semibold text-slate-700">{row.previousQuantity} → {row.newQuantity}</td>
              <td className="max-w-sm px-5 py-4 text-slate-600">
                <p>{row.reason}</p>
                {row.note && <p className="mt-1 text-[10.5px] text-slate-400">{row.note}</p>}
                <p className="mt-1 text-[10.5px] text-slate-400">Source: {row.source}</p>
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-slate-500">{formatDateTime(row.createdAt)}</td>
            </tr>)}
          </tbody>
        </table>
      </div> : <DashboardEmptyState title="No inventory movements found" description="No immutable stock records match this product." />}
    </DashboardPanel>

    {totalPages > 1 && <nav className="mt-5 flex items-center justify-between">
      <span>{page > 1 && <Link href={pageHref(page - 1)} className="inline-flex items-center gap-2 text-[12px] font-semibold"><ChevronLeft className="h-4 w-4" /> Previous</Link>}</span>
      <p className="text-[12px] text-slate-500">Page {page} of {totalPages}</p>
      <span>{page < totalPages && <Link href={pageHref(page + 1)} className="inline-flex items-center gap-2 text-[12px] font-semibold">Next <ChevronRight className="h-4 w-4" /></Link>}</span>
    </nav>}
  </div>;
}
