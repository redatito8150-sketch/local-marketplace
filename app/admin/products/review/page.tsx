import { getBrandActivityNotifications } from "@/lib/data/admin";
import { NOTIFICATION_TYPE_LABELS } from "@/lib/admin/statuses";
import NotificationResolveActions from "@/components/admin/NotificationResolveActions";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";

const RESOLUTION_LABELS: Record<string, string> = { approved: "Approved", reverted: "Reverted", pending: "Pending" };
type ActivityParams = { q?: string; resolution?: string; type?: string; from?: string };

export default async function BrandActivityPage(props: { searchParams: Promise<ActivityParams> }) {
  const params = await props.searchParams;
  const allActivity = await getBrandActivityNotifications();
  const query = params.q?.trim().toLowerCase();
  const activity = allActivity.filter((item) => {
    if (query && !`${item.title} ${item.body ?? ""}`.toLowerCase().includes(query)) return false;
    if (params.resolution && item.resolution !== params.resolution) return false;
    if (params.type && item.type !== params.type) return false;
    if (params.from && new Date(item.createdAt) < new Date(`${params.from}T00:00:00`)) return false;
    return true;
  });
  const pendingCount = allActivity.filter((item) => item.resolution === "pending").length;
  const types = [...new Set(allActivity.map((item) => item.type))].sort();
  const activeCount = [params.q, params.resolution, params.type, params.from].filter(Boolean).length;

  return (
    <div>
      <DashboardPageHeader eyebrow="Brands" title={`Brand activity (${activity.length})`} description={`Brand product changes publish through the existing workflow. ${pendingCount} activities currently need an administrative decision.`} />
      <DashboardFilters action="/admin/products/review" clearHref="/admin/products/review" activeCount={activeCount}>
        <DashboardFilterField label="Search" className="lg:flex-1"><input name="q" defaultValue={params.q ?? ""} placeholder="Activity title or details" className={`${dashboardFilterControl} w-full lg:min-w-[240px]`} /></DashboardFilterField>
        <DashboardFilterField label="Decision"><select name="resolution" defaultValue={params.resolution ?? ""} className={dashboardFilterControl}><option value="">All decisions</option>{Object.entries(RESOLUTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></DashboardFilterField>
        <DashboardFilterField label="Activity type"><select name="type" defaultValue={params.type ?? ""} className={dashboardFilterControl}><option value="">All types</option>{types.map((value) => <option key={value} value={value}>{NOTIFICATION_TYPE_LABELS[value] ?? value}</option>)}</select></DashboardFilterField>
        <DashboardFilterField label="Since"><input type="date" name="from" defaultValue={params.from ?? ""} className={dashboardFilterControl} /></DashboardFilterField>
      </DashboardFilters>
      <DashboardPanel className="mt-6">
        {activity.length ? <div className="divide-y divide-slate-100">{activity.map((item) => <div key={item.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{NOTIFICATION_TYPE_LABELS[item.type] ?? item.type}</span><time className="text-[10.5px] text-slate-400">{new Date(item.createdAt).toLocaleString("en-US")}</time></div><p className="mt-2 text-[13px] font-bold text-slate-900">{item.title}</p>{item.body && <p className="mt-1 max-w-3xl text-[11.5px] leading-5 text-slate-500">{item.body}</p>}</div><div className="flex-none">{item.resolution === "pending" ? <NotificationResolveActions notificationId={item.id} /> : <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10.5px] font-bold text-slate-600">{RESOLUTION_LABELS[item.resolution] ?? item.resolution}</span>}</div></div>)}</div> : <DashboardEmptyState title="No matching brand activity" description={activeCount ? "Clear or adjust the filters to find more activity." : "Brand owner and assistant product changes will appear here."} />}
      </DashboardPanel>
    </div>
  );
}
