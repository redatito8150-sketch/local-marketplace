import Link from "next/link";
import { getAllApplicationsForAdmin } from "@/lib/data/admin";
import { APPLICATION_STATUS_LABELS, applicationStatusBadgeClass } from "@/lib/admin/statuses";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";

type ApplicationParams = { q?: string; status?: string; category?: string; from?: string; sort?: string };

export default async function AdminApplicationsPage(props: { searchParams: Promise<ApplicationParams> }) {
  const params = await props.searchParams;
  const allApplications = await getAllApplicationsForAdmin();
  const query = params.q?.trim().toLowerCase();
  const applications = allApplications.filter((application) => {
    if (query && !`${application.brandName} ${application.founderName} ${application.email}`.toLowerCase().includes(query)) return false;
    if (params.status && application.status !== params.status) return false;
    if (params.category && application.productCategory !== params.category) return false;
    if (params.from && new Date(application.createdAt) < new Date(`${params.from}T00:00:00`)) return false;
    return true;
  });
  applications.sort((a, b) => params.sort === "oldest" ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() : params.sort === "brand" ? a.brandName.localeCompare(b.brandName) : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const categories = [...new Set(allApplications.map((application) => application.productCategory).filter(Boolean))].sort();
  const activeCount = [params.q, params.status, params.category, params.from, params.sort].filter(Boolean).length;

  return (
    <div>
      <DashboardPageHeader eyebrow="Brands" title={`Brand applications (${applications.length})`} description="Review real applications submitted through the storefront and open each record before changing its status." />
      <DashboardFilters action="/admin/applications" clearHref="/admin/applications" activeCount={activeCount}>
        <DashboardFilterField label="Search" className="lg:flex-1"><input name="q" defaultValue={params.q ?? ""} placeholder="Brand, founder or email" className={`${dashboardFilterControl} w-full lg:min-w-[240px]`} /></DashboardFilterField>
        <DashboardFilterField label="Status"><select name="status" defaultValue={params.status ?? ""} className={dashboardFilterControl}><option value="">All statuses</option>{Object.entries(APPLICATION_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></DashboardFilterField>
        <DashboardFilterField label="Category"><select name="category" defaultValue={params.category ?? ""} className={dashboardFilterControl}><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></DashboardFilterField>
        <DashboardFilterField label="Submitted after"><input type="date" name="from" defaultValue={params.from ?? ""} className={dashboardFilterControl} /></DashboardFilterField>
        <DashboardFilterField label="Sort"><select name="sort" defaultValue={params.sort ?? ""} className={dashboardFilterControl}><option value="">Newest</option><option value="oldest">Oldest</option><option value="brand">Brand A–Z</option></select></DashboardFilterField>
      </DashboardFilters>
      <DashboardPanel className="mt-6">
        {applications.length ? <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-[13px]"><thead className="border-b border-slate-200 bg-slate-50/80 text-[10.5px] uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-5 py-3 font-semibold">Brand</th><th className="px-5 py-3 font-semibold">Founder</th><th className="px-5 py-3 font-semibold">Category</th><th className="px-5 py-3 font-semibold">Submitted</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{applications.map((application) => <tr key={application.id} className="hover:bg-slate-50/70"><td className="px-5 py-4 font-bold text-slate-900">{application.brandName}</td><td className="px-5 py-4"><p className="font-medium text-slate-700">{application.founderName}</p><p className="mt-0.5 text-[11px] text-slate-500">{application.email}</p></td><td className="px-5 py-4 text-slate-600">{application.productCategory}</td><td className="px-5 py-4 text-slate-500">{new Date(application.createdAt).toLocaleDateString("en-US")}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${applicationStatusBadgeClass(application.status)}`}>{APPLICATION_STATUS_LABELS[application.status]}</span></td><td className="px-5 py-4 text-right"><Link href={`/admin/applications/${application.id}`} className="text-[12px] font-bold text-mahalyred hover:underline">Review</Link></td></tr>)}</tbody></table></div> : <DashboardEmptyState title="No matching applications" description={activeCount ? "Clear or adjust the filters to see more applications." : "New brand applications will appear here."} />}
      </DashboardPanel>
    </div>
  );
}
