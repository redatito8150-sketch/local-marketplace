import Link from "next/link";
import { getAllPaymentAttemptsForAdmin } from "@/lib/data/admin";
import { formatDateOnly, formatPrice } from "@/lib/format";
import { PAYMENT_ATTEMPT_STATUSES, PAYMENT_ATTEMPT_STATUS_LABELS, paymentAttemptStatusBadgeClass } from "@/lib/admin/statuses";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";
import { normalizeReference, normalizeSearchText } from "@/lib/search/normalize";

type PaymentSearchParams = { q?: string; status?: string; from?: string; to?: string; sort?: string; page?: string };
const PAGE_SIZE = 25;

// The general index this admin area was missing — /admin/payments/refund-queue
// (unchanged, still linked from here) only ever surfaces the narrow "needs
// refund review" subset; this page is every payment_attempt, searchable.
export default async function AdminPaymentsPage(props: { searchParams: Promise<PaymentSearchParams> }) {
  const params = await props.searchParams;
  const allAttempts = await getAllPaymentAttemptsForAdmin();
  const query = normalizeSearchText(params.q ?? "");
  const referenceQuery = normalizeReference(params.q ?? "");

  const filtered = allAttempts.filter((attempt) => {
    if (
      query &&
      !normalizeSearchText(`${attempt.specialReference} ${attempt.masterOrderNumber ?? ""} ${attempt.userEmail ?? ""}`).includes(query)
      && !(referenceQuery.length >= 3 && [attempt.specialReference, attempt.masterOrderNumber].some((value) => normalizeReference(value ?? "").includes(referenceQuery)))
    ) {
      return false;
    }
    if (params.status && attempt.status !== params.status) return false;
    if (params.from && new Date(attempt.createdAt) < new Date(`${params.from}T00:00:00`)) return false;
    if (params.to && new Date(attempt.createdAt) > new Date(`${params.to}T23:59:59.999`)) return false;
    return true;
  });
  filtered.sort((a, b) =>
    params.sort === "oldest"
      ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      : params.sort === "amount-desc"
      ? b.amountCents - a.amountCents
      : params.sort === "amount-asc"
      ? a.amountCents - b.amountCents
      : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(Number(params.page) || 1, 1), pageCount);
  const attempts = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const activeCount = [params.q, params.status, params.from, params.to, params.sort].filter(Boolean).length;
  const pageHref = (page: number) => {
    const next = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value && key !== "page") next.set(key, value);
    });
    next.set("page", String(page));
    return `/admin/payments?${next}`;
  };

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Commerce"
        title={`Payments (${filtered.length})`}
        description="Every Paymob card payment attempt — search, filter, and open one for the full breakdown, including which orders it fulfilled."
        actions={
          <Link
            href="/admin/payments/refund-queue"
            className="rounded-md border border-stone-150 bg-white px-3.5 py-2 text-[12.5px] font-medium text-ink hover:bg-stone-50"
          >
            Refund review
          </Link>
        }
      />

      <DashboardFilters action="/admin/payments" clearHref="/admin/payments" activeCount={activeCount}>
        <DashboardFilterField label="Search" className="lg:flex-1">
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Reference, purchase # or email"
            className={`${dashboardFilterControl} w-full lg:min-w-[240px]`}
          />
        </DashboardFilterField>
        <DashboardFilterField label="Status">
          <select name="status" defaultValue={params.status ?? ""} className={dashboardFilterControl}>
            <option value="">All statuses</option>
            {PAYMENT_ATTEMPT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PAYMENT_ATTEMPT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </DashboardFilterField>
        <DashboardFilterField label="From">
          <input type="date" name="from" defaultValue={params.from ?? ""} className={dashboardFilterControl} />
        </DashboardFilterField>
        <DashboardFilterField label="To">
          <input type="date" name="to" defaultValue={params.to ?? ""} className={dashboardFilterControl} />
        </DashboardFilterField>
        <DashboardFilterField label="Sort">
          <select name="sort" defaultValue={params.sort ?? ""} className={dashboardFilterControl}>
            <option value="">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="amount-desc">Highest amount</option>
            <option value="amount-asc">Lowest amount</option>
          </select>
        </DashboardFilterField>
      </DashboardFilters>

      <DashboardPanel className="mt-6">
        {attempts.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[10.5px] uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Reference</th>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Purchase</th>
                  <th className="px-5 py-3 font-semibold">Amount</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attempts.map((attempt) => (
                  <tr key={attempt.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4 font-mono text-[11.5px] text-slate-600">{attempt.specialReference}</td>
                    <td className="px-5 py-4 text-slate-700">{attempt.userEmail ?? "—"}</td>
                    <td className="px-5 py-4 text-slate-700">
                      {attempt.masterOrderNumber ? (
                        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10.5px] font-bold text-sky-700">
                          {attempt.masterOrderNumber}
                        </span>
                      ) : (
                        <span className="text-[11.5px] text-slate-400">Not fulfilled</span>
                      )}
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-900">
                      {formatPrice(attempt.amountCents / 100, attempt.currency === "EGP" ? "EGP" : "USD")}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${paymentAttemptStatusBadgeClass(attempt.status)}`}
                      >
                        {PAYMENT_ATTEMPT_STATUS_LABELS[attempt.status as keyof typeof PAYMENT_ATTEMPT_STATUS_LABELS] ?? attempt.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-500">{formatDateOnly(attempt.createdAt)}</td>
                    <td className="px-5 py-4 text-right">
                      <Link href={`/admin/payments/${attempt.id}`} className="text-[12px] font-bold text-mahalyred hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <DashboardEmptyState
            title="No matching payments"
            description={activeCount ? "Clear or adjust the active filters to see more payments." : "Card payment attempts will appear here once customers start checking out with Paymob."}
          />
        )}
        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
            <p className="text-[11.5px] text-slate-500">
              Page {currentPage} of {pageCount}
            </p>
            <div className="flex gap-2">
              {currentPage > 1 && (
                <Link href={pageHref(currentPage - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11.5px] font-semibold text-slate-700">
                  Previous
                </Link>
              )}
              {currentPage < pageCount && (
                <Link href={pageHref(currentPage + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11.5px] font-semibold text-slate-700">
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </DashboardPanel>
    </div>
  );
}
