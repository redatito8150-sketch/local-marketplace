import Link from "next/link";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { listDeletionSchedules } from "@/lib/admin/productDeletion";
import { formatDateTime } from "@/lib/format";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";
import DeletionScheduleRowActions from "@/components/admin/DeletionScheduleRowActions";

type Params = { q?: string; status?: string; partner?: string; page?: string };

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  cancelled: "Cancelled",
  blocked: "Blocked",
  completed: "Completed",
};

const PAGE_SIZE = 25;

// The admin-facing half of the product deletion lifecycle — NOT an
// approval queue. Ordinary deletion is database-authoritative and fully
// automatic: a brand owner (or admin) schedules it, a 7-day grace period
// runs, and it either executes automatically or gets blocked by new
// activity — there is nothing here for a human to approve. This page is
// purely operational history + the ability to cancel an active schedule
// or, via the Retired tab, apply a legal/admin hold.
export default async function DeletionSchedulesPage(props: { searchParams: Promise<Params> }) {
  const params = await props.searchParams;
  const staff = await requireStaffRole("staff");
  const canCancel = staff?.role === "manager" || staff?.role === "admin";

  const page = Math.max(1, Number(params.page) || 1);
  const result = await listDeletionSchedules({
    status: (params.status as never) || undefined,
    isPartner: params.partner === "true" ? true : params.partner === "false" ? false : undefined,
    search: params.q,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const activeCount = [params.q, params.status, params.partner].filter(Boolean).length;
  const hasMore = (page - 1) * PAGE_SIZE + result.rows.length < result.total;

  const pageHref = (targetPage: number) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.status) sp.set("status", params.status);
    if (params.partner) sp.set("partner", params.partner);
    if (targetPage > 1) sp.set("page", String(targetPage));
    const qs = sp.toString();
    return `/admin/products/deletion-schedules${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Products"
        title={`Deletion schedules (${result.total} total)`}
        description="Every automatic permanent-deletion schedule, active or resolved. Eligibility is recomputed fresh right before each one executes — a schedule that looked clean when created can still be blocked here if new activity (an order, a warehouse receipt, a review, a legal hold) happened before the due date."
      />
      <DashboardFilters action="/admin/products/deletion-schedules" clearHref="/admin/products/deletion-schedules" activeCount={activeCount}>
        <DashboardFilterField label="Search" className="lg:flex-1">
          <input name="q" defaultValue={params.q ?? ""} placeholder="Product, brand, or schedule ID" className={`${dashboardFilterControl} w-full lg:min-w-[240px]`} />
        </DashboardFilterField>
        <DashboardFilterField label="Status">
          <select name="status" defaultValue={params.status ?? ""} className={dashboardFilterControl}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </DashboardFilterField>
        <DashboardFilterField label="Brand type">
          <select name="partner" defaultValue={params.partner ?? ""} className={dashboardFilterControl}>
            <option value="">All brands</option>
            <option value="true">Zakhnook-fulfilled (partner)</option>
            <option value="false">Direct / brand-fulfilled</option>
          </select>
        </DashboardFilterField>
      </DashboardFilters>
      <div className="mt-3">
        <Link href="/admin/products/retired" className="text-[12.5px] font-semibold text-mahalyred hover:underline">View Retired products →</Link>
      </div>
      <DashboardPanel className="mt-6">
        {result.rows.length ? (
          <div className="divide-y divide-slate-100">
            {result.rows.map((schedule) => (
              <div key={schedule.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                      schedule.status === "cancelled" ? "bg-slate-100 text-slate-500"
                      : schedule.status === "completed" ? "bg-red-100 text-red-700"
                      : schedule.status === "blocked" ? "bg-amber-50 text-amber-800"
                      : "bg-blue-50 text-blue-700"
                    }`}>{STATUS_LABELS[schedule.status] ?? schedule.status}</span>
                    <time className="text-[10.5px] text-slate-400">Scheduled {formatDateTime(schedule.scheduledAt)}</time>
                    {schedule.status === "scheduled" && <time className="text-[10.5px] font-semibold text-red-600">Due {formatDateTime(schedule.dueAt)}</time>}
                    {schedule.brandIsPartner && <span className="rounded-full bg-purple-50 px-2.5 py-1 text-[10px] font-bold text-purple-700">Partner</span>}
                    {schedule.hasActiveHold && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800">On hold</span>}
                  </div>
                  <p className="mt-2 text-[13px] font-bold text-slate-900">{schedule.productName}</p>
                  {!schedule.productId && (
                    <p className="mt-0.5 text-[10.5px] italic text-slate-400">This product has been permanently deleted — shown here for historical record only.</p>
                  )}
                  <p className="mt-1 text-[11.5px] text-slate-500">{schedule.brandName ?? schedule.brandId} · Initiated by {schedule.initiatedByLabel}</p>
                  {schedule.reason && <p className="mt-1 max-w-2xl text-[11.5px] leading-5 text-slate-500">{schedule.reason}</p>}
                  {schedule.status === "blocked" && schedule.blockedReason && (
                    <p className="mt-2 max-w-2xl text-[11.5px] font-semibold text-amber-800">{schedule.blockedReason}</p>
                  )}
                  {schedule.blockerSnapshot.length > 0 && (
                    <ul className="mt-2 max-w-2xl list-disc space-y-0.5 pl-5 text-[11px] text-amber-800">
                      {schedule.blockerSnapshot.map((b) => <li key={b.code}>{b.message}</li>)}
                    </ul>
                  )}
                </div>
                <DeletionScheduleRowActions productId={schedule.productId} status={schedule.status} canCancel={canCancel} />
              </div>
            ))}
          </div>
        ) : (
          <DashboardEmptyState title="No matching deletion schedules" description={activeCount ? "Clear or adjust the filters to find more schedules." : "Scheduled, blocked, cancelled, and completed permanent deletions will appear here."} />
        )}
      </DashboardPanel>
      {(page > 1 || hasMore) && (
        <div className="mt-4 flex items-center justify-between text-[12.5px] text-slate-600">
          <span>Page {page} of {Math.max(1, Math.ceil(result.total / PAGE_SIZE))}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={pageHref(page - 1)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 font-medium hover:bg-slate-50">Previous</Link>}
            {hasMore && <Link href={pageHref(page + 1)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 font-medium hover:bg-slate-50">Next</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
