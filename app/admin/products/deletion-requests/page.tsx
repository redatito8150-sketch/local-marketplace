import Link from "next/link";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { listDeletionRequests } from "@/lib/admin/productDeletion";
import { formatDateTime } from "@/lib/format";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";
import DeletionRequestRowActions from "@/components/admin/DeletionRequestRowActions";

type Params = { q?: string; status?: string; partner?: string; page?: string };

const STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  under_review: "Under review",
  blocked: "Blocked",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  completed: "Completed",
};

const PAGE_SIZE = 25;

// The admin-facing half of the product deletion lifecycle — every
// permanent deletion request a brand has filed, with its current
// (recomputed, never stale) blockers and a reviewed audit trail. Replaces
// the old raw "Delete" button on the products list, which used to hard-
// delete with zero dependency checks (supabase/migrations/
// 20260814020000_product_deletion_lifecycle.sql).
export default async function DeletionRequestsPage(props: { searchParams: Promise<Params> }) {
  const params = await props.searchParams;
  // The layout above /admin already redirects unauthenticated/non-admin
  // visitors — this call is only to learn the viewer's own rank, so the
  // Approve button (admin-only, matching the RPC's own gate) is never
  // rendered for a "manager" who would just get a 403 clicking it. Server
  // authorization on the approve route itself remains the real boundary.
  const staff = await requireStaffRole("staff");
  const canApprove = staff?.role === "admin";

  const page = Math.max(1, Number(params.page) || 1);
  const result = await listDeletionRequests({
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
    return `/admin/products/deletion-requests${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Products"
        title={`Deletion requests (${result.total} total)`}
        description="Every brand request to permanently delete an archived product. The database recomputes eligibility fresh every time — a request that looked clean when filed can still be blocked here if new activity (an order, a warehouse receipt, a review) has happened since."
      />
      <DashboardFilters action="/admin/products/deletion-requests" clearHref="/admin/products/deletion-requests" activeCount={activeCount}>
        <DashboardFilterField label="Search" className="lg:flex-1">
          <input name="q" defaultValue={params.q ?? ""} placeholder="Product, brand, or request ID" className={`${dashboardFilterControl} w-full lg:min-w-[240px]`} />
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
      <DashboardPanel className="mt-6">
        {result.rows.length ? (
          <div className="divide-y divide-slate-100">
            {result.rows.map((request) => (
              <div key={request.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                      request.status === "rejected" || request.status === "cancelled" ? "bg-slate-100 text-slate-500"
                      : request.status === "completed" ? "bg-red-100 text-red-700"
                      : request.status === "blocked" ? "bg-amber-50 text-amber-800"
                      : "bg-blue-50 text-blue-700"
                    }`}>{STATUS_LABELS[request.status] ?? request.status}</span>
                    <time className="text-[10.5px] text-slate-400">{formatDateTime(request.requestedAt)}</time>
                    {request.brandIsPartner && <span className="rounded-full bg-purple-50 px-2.5 py-1 text-[10px] font-bold text-purple-700">Partner</span>}
                  </div>
                  <p className="mt-2 text-[13px] font-bold text-slate-900">{request.productName}</p>
                  {!request.productId && (
                    <p className="mt-0.5 text-[10.5px] italic text-slate-400">This product has been permanently deleted — shown here for historical record only.</p>
                  )}
                  <p className="mt-1 text-[11.5px] text-slate-500">{request.brandName ?? request.brandId} · Requested by {request.requestedByLabel}</p>
                  <p className="mt-1 max-w-2xl text-[11.5px] leading-5 text-slate-500">{request.reason}</p>
                  {request.blockerSnapshot.length > 0 && (
                    <ul className="mt-2 max-w-2xl list-disc space-y-0.5 pl-5 text-[11px] text-amber-800">
                      {request.blockerSnapshot.map((b) => <li key={b.code}>{b.message}</li>)}
                    </ul>
                  )}
                  {request.adminNote && <p className="mt-2 max-w-2xl text-[11.5px] italic text-slate-500">Admin note: {request.adminNote}</p>}
                </div>
                <DeletionRequestRowActions requestId={request.id} status={request.status} canApprove={canApprove} />
              </div>
            ))}
          </div>
        ) : (
          <DashboardEmptyState title="No matching deletion requests" description={activeCount ? "Clear or adjust the filters to find more requests." : "Brand-submitted permanent deletion requests will appear here."} />
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
