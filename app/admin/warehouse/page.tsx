import Link from "next/link";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock, Package, XCircle } from "lucide-react";
import { getAllWarehouseTransfers, type WarehouseTransferRow } from "@/lib/data/warehouse";
import { DashboardEmptyState, DashboardPageHeader } from "@/components/dashboard/DashboardUI";
import AdminWorkspaceNav from "@/components/admin/AdminWorkspaceNav";
import { CONTROL, TonePill, formatCount } from "@/components/admin/inventory/shared";

type Params = { status?: string; direction?: string; brand?: string };

const STATUS_META: Record<string, { label: string; tone: "amber" | "emerald" | "red"; icon: React.ElementType }> = {
  pending: { label: "Pending", tone: "amber", icon: Clock },
  received: { label: "Received", tone: "emerald", icon: CheckCircle2 },
  rejected: { label: "Rejected", tone: "red", icon: XCircle },
};

export default async function AdminWarehousePage(props: { searchParams: Promise<Params> }) {
  const params = await props.searchParams;
  const status = params.status === "pending" || params.status === "received" || params.status === "rejected" ? params.status : undefined;
  const direction = params.direction === "to_local" || params.direction === "to_brand" ? params.direction : undefined;
  const brand = params.brand ?? "";

  const allTransfers = await getAllWarehouseTransfers(status);
  const brandOptions = [...new Set(allTransfers.map((t) => t.brandName))].sort((a, b) => a.localeCompare(b));
  const transfers = allTransfers.filter((t) => (!direction || t.direction === direction) && (!brand || t.brandName === brand));

  const pendingCount = allTransfers.filter((t) => t.status === "pending").length;
  const pendingUnits = allTransfers.filter((t) => t.status === "pending").reduce((sum, t) => sum + t.items.reduce((s, i) => s + i.requestedQty, 0), 0);
  const discrepancyCount = allTransfers.filter((t) => t.items.some((i) => (i.damagedQty ?? 0) > 0 || (i.missingQty ?? 0) > 0)).length;

  return (
    <div>
      <AdminWorkspaceNav workspace="inventory" activeHref="/admin/warehouse" />
      <DashboardPageHeader
        title="Partner Stock Requests"
        description="Restock and return requests from Zakhnook Partner brands (اذن صرف مخزن). Stock only moves once you confirm receipt here — brands own and request their own stock levels."
      />
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <SummaryCard label="Pending decisions" value={pendingCount} icon={Clock} tone={pendingCount ? "amber" : "neutral"} />
        <SummaryCard label="Units awaiting decision" value={pendingUnits} icon={Package} tone="neutral" />
        <SummaryCard label="Open discrepancies" value={discrepancyCount} icon={AlertTriangle} tone={discrepancyCount ? "red" : "neutral"} />
      </div>
      <WarehouseFilters status={status ?? ""} direction={direction ?? ""} brand={brand} brandOptions={brandOptions} />
      <section className="mt-4 overflow-hidden rounded-[22px] border-0 bg-[#ece7e0] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
        {transfers.length === 0 ? (
          <DashboardEmptyState title="No requests" description="Nothing to show for this filter yet." />
        ) : (
          <div className="divide-y divide-[#eee7e1]">
            {transfers.map((transfer) => (
              <TransferRow key={transfer.id} transfer={transfer} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: React.ElementType; tone: "amber" | "red" | "neutral" }) {
  const iconStyle = tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "red" ? "bg-red-50 text-red-700" : "bg-[#e6e0d8] text-[#5b5049]";
  return (
    <div className="flex items-center gap-3 rounded-[20px] border-0 bg-[#ece7e0] p-4 shadow-[0_12px_32px_rgba(72,50,36,.07)]">
      <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${iconStyle}`}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[8.5px] font-bold uppercase tracking-[0.08em] text-[#9a8c82]">{label}</p>
        <p className="mt-0.5 text-[17px] font-extrabold tabular-nums text-[#302924]">{formatCount(value)}</p>
      </div>
    </div>
  );
}

function WarehouseFilters({ status, direction, brand, brandOptions }: { status: string; direction: string; brand: string; brandOptions: string[] }) {
  const active = Boolean(status || direction || brand);
  return (
    <form action="/admin/warehouse" className="mt-4 grid gap-2 rounded-2xl bg-[#e6e0d8] p-2 sm:grid-cols-3 lg:grid-cols-[190px_220px_1fr_auto]">
      <select name="status" defaultValue={status} className={`${CONTROL} w-full`}>
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="received">Received</option>
        <option value="rejected">Rejected</option>
      </select>
      <select name="direction" defaultValue={direction} className={`${CONTROL} w-full`}>
        <option value="">Restock and return requests</option>
        <option value="to_local">Restock requests only</option>
        <option value="to_brand">Return requests only</option>
      </select>
      <select name="brand" defaultValue={brand} className={`${CONTROL} w-full`}>
        <option value="">All partner brands</option>
        {brandOptions.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <button className="h-11 rounded-xl bg-[#C85956] px-4 text-[11px] font-bold text-white transition-colors hover:bg-[#b84e4b]">Apply</button>
        {active ? (
          <Link href="/admin/warehouse" className="px-2 text-[10px] font-bold text-[#75685f] hover:text-[#C85956]">
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}

function TransferRow({ transfer }: { transfer: WarehouseTransferRow }) {
  const badge = STATUS_META[transfer.status] ?? STATUS_META.pending;
  const hasDiscrepancy = transfer.items.some((i) => (i.damagedQty ?? 0) > 0 || (i.missingQty ?? 0) > 0);
  const totalRequested = transfer.items.reduce((sum, i) => sum + i.requestedQty, 0);
  const isReturn = transfer.direction === "to_brand";
  const DirectionIcon = isReturn ? ArrowUpRight : ArrowDownLeft;

  return (
    <Link href={`/admin/warehouse/${transfer.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 transition-colors hover:bg-[#e4ded6]">
      <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-extrabold ${isReturn ? "bg-[#f1e4dd] text-[#9a4a3c]" : "bg-[#e2ecdf] text-[#3f6b4a]"}`}>
        <DirectionIcon className="h-3 w-3" />
        {isReturn ? "Return request" : "Restock request"}
      </span>
      <TonePill label={badge.label} tone={badge.tone} icon={badge.icon} />
      <span className="text-[13px] font-extrabold text-[#302924]">{transfer.brandName}</span>
      <span className="text-[11.5px] text-[#8d8076]">
        {transfer.items.length} item{transfer.items.length === 1 ? "" : "s"} · {formatCount(totalRequested)} units
      </span>
      <span className="text-[10.5px] text-[#a2948a]">{new Date(transfer.requestedAt).toLocaleString()}</span>
      {hasDiscrepancy && (
        <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-bold text-amber-700">
          <AlertTriangle className="h-3 w-3" /> Discrepancy
        </span>
      )}
    </Link>
  );
}
