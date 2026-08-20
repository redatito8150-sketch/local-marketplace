import Link from "next/link";
import { getAllApplicationsForAdmin } from "@/lib/data/admin";
import { APPLICATION_STATUS_LABELS, applicationStatusBadgeClass } from "@/lib/admin/statuses";
import DashboardFilters, { DashboardFilterField, DashboardMoreFilters, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";
import { formatDateOnly } from "@/lib/format";
import type { BrandApplicationRecord } from "@/types";
import AdminWorkspaceNav from "@/components/admin/AdminWorkspaceNav";
import DateRangePicker from "@/components/ui/DateRangePicker";
import SortableTableHeader, { tableSortHref } from "@/components/dashboard/SortableTableHeader";

type ApplicationParams = { q?: string; status?: string; category?: string; from?: string; to?: string; sort?: string };

// The applicant's actual Submit click, not whenever they first opened the
// draft — submittedAt is unset for drafts that were never submitted, so
// this always falls back to createdAt for those.
function submissionTime(application: BrandApplicationRecord): number {
  return new Date(application.submittedAt ?? application.createdAt).getTime();
}

export default async function AdminApplicationsPage(props: { searchParams: Promise<ApplicationParams> }) {
  const params = await props.searchParams;
  const allApplications = await getAllApplicationsForAdmin();
  const query = params.q?.trim().toLowerCase();
  const applications = allApplications.filter((application) => {
    if (query && !`${application.brandName} ${application.founderName} ${application.email}`.toLowerCase().includes(query)) return false;
    if (params.status && application.status !== params.status) return false;
    if (params.category && application.productCategory !== params.category) return false;
    if (params.from && submissionTime(application) < new Date(`${params.from}T00:00:00`).getTime()) return false;
    if (params.to && submissionTime(application) > new Date(`${params.to}T23:59:59.999`).getTime()) return false;
    return true;
  });
  applications.sort((a, b) => {
    const direction = params.sort?.endsWith("-desc") ? -1 : 1;
    if (params.sort?.startsWith("brand-")) return direction * a.brandName.localeCompare(b.brandName);
    if (params.sort?.startsWith("founder-")) return direction * a.founderName.localeCompare(b.founderName);
    if (params.sort?.startsWith("category-")) return direction * a.productCategory.localeCompare(b.productCategory);
    if (params.sort?.startsWith("status-")) return direction * a.status.localeCompare(b.status);
    if (params.sort?.startsWith("submitted-")) return direction * (submissionTime(a) - submissionTime(b));
    return submissionTime(b) - submissionTime(a);
  });
  const categories = [...new Set(allApplications.map((application) => application.productCategory).filter(Boolean))].sort();
  const activeCount = [params.q, params.status, params.category, params.from, params.to, params.sort].filter(Boolean).length;

  return (
    <div>
      <AdminWorkspaceNav workspace="brands" activeHref="/admin/applications" />
      <DashboardPageHeader eyebrow="Brands" title={`Brand applications (${applications.length})`} description="Review real applications submitted through the storefront and open each record before changing its status." />
      <DashboardFilters action="/admin/applications" clearHref="/admin/applications" activeCount={activeCount}>
        <DashboardFilterField label="Search" className="lg:flex-1"><input name="q" defaultValue={params.q ?? ""} placeholder="Brand, founder or email" className={`${dashboardFilterControl} w-full lg:min-w-[240px]`} /></DashboardFilterField>
        <DateRangePicker defaultFrom={params.from} defaultTo={params.to} compact />
        <DashboardMoreFilters label="More application filters" active={Boolean(params.status || params.category)}>
          <DashboardFilterField label="Status"><select name="status" defaultValue={params.status ?? ""} className={`${dashboardFilterControl} w-full`}><option value="">All statuses</option>{Object.entries(APPLICATION_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></DashboardFilterField>
          <DashboardFilterField label="Category"><select name="category" defaultValue={params.category ?? ""} className={`${dashboardFilterControl} w-full`}><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></DashboardFilterField>
        </DashboardMoreFilters>
      </DashboardFilters>
      <DashboardPanel className="mt-6">
        {applications.length ? <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-[13px]"><thead className="border-b border-slate-200 bg-slate-50/80 text-[10.5px] uppercase tracking-[0.08em] text-slate-500"><tr><SortableTableHeader label="Brand" href={tableSortHref("/admin/applications", params, "brand")} active={params.sort?.startsWith("brand-")} direction={params.sort?.endsWith("desc") ? "desc" : "asc"} /><SortableTableHeader label="Founder" href={tableSortHref("/admin/applications", params, "founder")} active={params.sort?.startsWith("founder-")} direction={params.sort?.endsWith("desc") ? "desc" : "asc"} /><SortableTableHeader label="Category" href={tableSortHref("/admin/applications", params, "category")} active={params.sort?.startsWith("category-")} direction={params.sort?.endsWith("desc") ? "desc" : "asc"} /><SortableTableHeader label="Submitted" href={tableSortHref("/admin/applications", params, "submitted", "desc")} active={!params.sort || params.sort.startsWith("submitted-")} direction={!params.sort || params.sort.endsWith("desc") ? "desc" : "asc"} /><SortableTableHeader label="Status" href={tableSortHref("/admin/applications", params, "status")} active={params.sort?.startsWith("status-")} direction={params.sort?.endsWith("desc") ? "desc" : "asc"} /><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{applications.map((application) => <tr key={application.id} className="hover:bg-slate-50/70"><td className="px-5 py-4 font-bold text-slate-900">{application.brandName}</td><td className="px-5 py-4"><p className="font-medium text-slate-700">{application.founderName}</p><p className="mt-0.5 text-[11px] text-slate-500">{application.email}</p></td><td className="px-5 py-4 text-slate-600">{application.productCategory}</td><td className="px-5 py-4 text-slate-500">{formatDateOnly(application.submittedAt ?? application.createdAt)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${applicationStatusBadgeClass(application.status)}`}>{APPLICATION_STATUS_LABELS[application.status]}</span></td><td className="px-5 py-4 text-right"><Link href={`/admin/applications/${application.id}`} className="text-[12px] font-bold text-mahalyred hover:underline">Review</Link></td></tr>)}</tbody></table></div> : <DashboardEmptyState title="No matching applications" description={activeCount ? "Clear or adjust the filters to see more applications." : "New brand applications will appear here."} />}
      </DashboardPanel>
    </div>
  );
}
