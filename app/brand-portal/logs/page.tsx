import { redirect } from "next/navigation";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getAuditLogsForBrand, getAllBrandsForAdmin } from "@/lib/data/admin";
import { describeAuditLog } from "@/lib/auditLogDescribe";
import BrandPicker from "@/components/brand-portal/BrandPicker";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";

type LogParams = { brand?: string; q?: string; action?: string; from?: string };

export default async function BrandPortalLogsPage(props: { searchParams: Promise<LogParams> }) {
  const params = await props.searchParams;
  const owner = await requireBrandOwner(params.brand);
  if (!owner) redirect("/account");
  if (!owner.brandSlug) { const brands = await getAllBrandsForAdmin(); return <BrandPicker brands={brands.map((brand) => ({ slug: brand.slug, name: brand.name }))} />; }
  if (owner.accessLevel !== "owner") redirect("/brand-portal");
  const allLogs = await getAuditLogsForBrand(owner.brandSlug);
  const query = params.q?.trim().toLowerCase();
  const logs = allLogs.filter((log) => {
    if (query && !describeAuditLog(log).toLowerCase().includes(query)) return false;
    if (params.action && log.action !== params.action) return false;
    if (params.from && new Date(log.createdAt) < new Date(`${params.from}T00:00:00`)) return false;
    return true;
  });
  const actions = [...new Set(allLogs.map((log) => log.action))].sort();
  const activeCount = [params.q, params.action, params.from].filter(Boolean).length;
  return (
    <div>
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <DashboardPageHeader eyebrow="Brand" title={`Activity (${logs.length})`} description={`A read-only record of changes made for ${owner.brandName} by owners, assistants, and Mahaly staff.`} />
      <DashboardFilters action="/brand-portal/logs" clearHref={`/brand-portal/logs${owner.isImpersonating ? `?brand=${owner.brandSlug}` : ""}`} activeCount={activeCount}>
        {owner.isImpersonating && <input type="hidden" name="brand" value={owner.brandSlug} />}
        <DashboardFilterField label="Search" className="lg:flex-1"><input name="q" defaultValue={params.q ?? ""} placeholder="Search activity" className={`${dashboardFilterControl} w-full lg:min-w-[240px]`} /></DashboardFilterField>
        <DashboardFilterField label="Action"><select name="action" defaultValue={params.action ?? ""} className={dashboardFilterControl}><option value="">All actions</option>{actions.map((action) => <option key={action} value={action}>{action.replaceAll("_", " ")}</option>)}</select></DashboardFilterField>
        <DashboardFilterField label="Since"><input type="date" name="from" defaultValue={params.from ?? ""} className={dashboardFilterControl} /></DashboardFilterField>
      </DashboardFilters>
      <DashboardPanel className="mt-6">
        {logs.length ? <div className="divide-y divide-[#eee7de]">{logs.map((log) => <div key={log.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[12.5px] leading-5 text-[#51473f]">{describeAuditLog(log)}</p><span className="mt-1 inline-flex rounded-full bg-[#f1eae2] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.06em] text-[#75685f]">{log.action.replaceAll("_", " ")}</span></div><time className="whitespace-nowrap text-[10.5px] text-[#9b8e84]">{new Date(log.createdAt).toLocaleString("en-US")}</time></div>)}</div> : <DashboardEmptyState title="No matching activity" description={activeCount ? "Clear or adjust the filters to find more activity." : "Brand changes will appear here once they are recorded."} />}
      </DashboardPanel>
    </div>
  );
}
