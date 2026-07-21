import { redirect } from "next/navigation";
import { getAllAuditLogsForAdmin } from "@/lib/data/admin";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { describeAuditLog } from "@/lib/auditLogDescribe";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";

const ENTITY_LABELS: Record<string, string> = { product: "Product", brand: "Brand", order: "Order", application: "Application", profile: "User", coupon: "Coupon", site_content: "Site content" };
const ACTION_LABELS: Record<string, string> = { create: "Created", update: "Updated", delete: "Deleted", status_change: "Status changed", bulk_archive: "Bulk archived", bulk_publish: "Bulk published", bulk_delete: "Bulk deleted", restock: "Restocked", role_change: "Role changed", pause: "Paused", unpause: "Unpaused", request_deletion: "Deletion requested", approve: "Approved", request_changes: "Changes requested", reject_deletion: "Deletion rejected", archive: "Archived", revert: "Reverted" };

export default async function AdminAuditLogPage(props: { searchParams: Promise<{ entityType?: string; action?: string; actor?: string; from?: string; to?: string }> }) {
  const params = await props.searchParams;
  const staff = await requireStaffRole("admin");
  if (!staff) redirect("/admin");
  const logs = await getAllAuditLogsForAdmin(200, { entityType: params.entityType, action: params.action, actorQuery: params.actor, dateFrom: params.from, dateTo: params.to });
  const activeCount = [params.entityType, params.action, params.actor, params.from, params.to].filter(Boolean).length;

  return (
    <div>
      <DashboardPageHeader eyebrow="Operations" title={`Audit log (${logs.length})`} description="A read-only record of administrative and brand-portal activity, including who acted and what changed." />
      <DashboardFilters action="/admin/audit-log" clearHref="/admin/audit-log" activeCount={activeCount}>
        <DashboardFilterField label="Actor" className="lg:flex-1"><input name="actor" defaultValue={params.actor ?? ""} placeholder="Name or email" className={`${dashboardFilterControl} w-full lg:min-w-[220px]`} /></DashboardFilterField>
        <DashboardFilterField label="Entity"><select name="entityType" defaultValue={params.entityType ?? ""} className={dashboardFilterControl}><option value="">All entities</option>{Object.entries(ENTITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></DashboardFilterField>
        <DashboardFilterField label="Action"><select name="action" defaultValue={params.action ?? ""} className={dashboardFilterControl}><option value="">All actions</option>{Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></DashboardFilterField>
        <DashboardFilterField label="From"><input type="date" name="from" defaultValue={params.from ?? ""} className={dashboardFilterControl} /></DashboardFilterField>
        <DashboardFilterField label="To"><input type="date" name="to" defaultValue={params.to ?? ""} className={dashboardFilterControl} /></DashboardFilterField>
      </DashboardFilters>
      <DashboardPanel className="mt-6">
        {logs.length ? <div className="divide-y divide-slate-100">{logs.map((log) => (
          <details key={log.id} className="group px-5 py-4 open:bg-slate-50/60"><summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-3"><span className="mt-0.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{ENTITY_LABELS[log.entityType] ?? log.entityType}</span><div className="min-w-0"><p className="text-[12.5px] leading-5 text-slate-800">{describeAuditLog(log)}</p><p className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.06em] text-slate-400">{ACTION_LABELS[log.action] ?? log.action}</p></div></div><time className="whitespace-nowrap pl-0 text-[11px] text-slate-400 sm:pl-4">{new Date(log.createdAt).toLocaleString("en-US")}</time></summary><div className="mt-4 grid gap-3 text-[11.5px] md:grid-cols-2"><AuditValue title="Before" value={log.beforeValue} /><AuditValue title="After" value={log.afterValue} /></div></details>
        ))}</div> : <DashboardEmptyState title="No matching activity" description={activeCount ? "Clear or adjust the filters to find more audit entries." : "Recorded administrative and brand activity will appear here."} />}
      </DashboardPanel>
    </div>
  );
}

function AuditValue({ title, value }: { title: string; value: unknown }) {
  return <div><p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">{title}</p><pre className="max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-slate-600">{JSON.stringify(value, null, 2) ?? "—"}</pre></div>;
}
