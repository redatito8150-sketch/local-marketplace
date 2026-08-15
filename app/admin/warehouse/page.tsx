import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { getAllWarehouseTransfers } from "@/lib/data/warehouse";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import AdminWorkspaceNav from "@/components/admin/AdminWorkspaceNav";

type Params = { status?: string };

const STATUS_BADGE: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  pending: { label: "Pending", className: "bg-amber-50 text-amber-700", icon: Clock },
  received: { label: "Received", className: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  rejected: { label: "Rejected", className: "bg-red-50 text-red-700", icon: XCircle },
};

export default async function AdminWarehousePage(props: { searchParams: Promise<Params> }) {
  const params = await props.searchParams;
  const status = params.status === "pending" || params.status === "received" || params.status === "rejected" ? params.status : undefined;
  const transfers = await getAllWarehouseTransfers(status);

  return (
    <div>
      <AdminWorkspaceNav workspace="inventory" activeHref="/admin/warehouse" />
      <DashboardPageHeader
        eyebrow="Commerce"
        title={`Local Warehouse (${transfers.length})`}
        description="Transfer requests from Zakhnook Partner brands (اذن صرف مخزن). Confirm receipt to move stock onto the storefront, or reject a request that never shipped."
      />
      <DashboardFilters action="/admin/warehouse" clearHref="/admin/warehouse" activeCount={status ? 1 : 0}>
        <DashboardFilterField label="Status">
          <select name="status" defaultValue={status ?? ""} className={dashboardFilterControl}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="received">Received</option>
            <option value="rejected">Rejected</option>
          </select>
        </DashboardFilterField>
      </DashboardFilters>
      <DashboardPanel className="mt-6">
        {transfers.length === 0 ? (
          <DashboardEmptyState title="No transfers" description="Nothing to show for this filter yet." />
        ) : (
          <div className="divide-y divide-slate-100">
            {transfers.map((t) => {
              const badge = STATUS_BADGE[t.status];
              const Icon = badge.icon;
              const hasDiscrepancy = t.items.some((i) => (i.damagedQty ?? 0) > 0 || (i.missingQty ?? 0) > 0);
              const totalRequested = t.items.reduce((sum, i) => sum + i.requestedQty, 0);
              return (
                <Link key={t.id} href={`/admin/warehouse/${t.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-slate-50/70">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {t.direction === "to_brand" ? "Return" : "Transfer"}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.className}`}>
                    <Icon className="h-3 w-3" /> {badge.label}
                  </span>
                  <span className="font-bold text-slate-900">{t.brandName}</span>
                  <span className="text-[12.5px] text-slate-500">{t.items.length} item{t.items.length === 1 ? "" : "s"} · {totalRequested} units</span>
                  <span className="text-[12px] text-slate-400">{new Date(t.requestedAt).toLocaleString()}</span>
                  {hasDiscrepancy && (
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                      <AlertTriangle className="h-3 w-3" /> Discrepancy
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </DashboardPanel>
    </div>
  );
}
