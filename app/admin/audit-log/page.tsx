import { redirect } from "next/navigation";
import Link from "next/link";
import { getAllAuditLogsForAdmin } from "@/lib/data/admin";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { describeAuditLog } from "@/lib/auditLogDescribe";

const ENTITY_LABELS: Record<string, string> = {
  product: "Product",
  brand: "Brand",
  order: "Order",
  application: "Application",
  profile: "User",
  coupon: "Coupon",
  site_content: "Site content",
};

export default async function AdminAuditLogPage(
  props: {
    searchParams: Promise<{ entityType?: string; actor?: string; from?: string; to?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const staff = await requireStaffRole("admin");
  if (!staff) redirect("/admin");

  const { entityType, actor, from, to } = searchParams;
  const logs = await getAllAuditLogsForAdmin(200, {
    entityType,
    actorQuery: actor,
    dateFrom: from,
    dateTo: to,
  });
  const hasFilters = Boolean(entityType || actor || from || to);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">
        Audit Log ({logs.length})
      </h1>
      <p className="mt-1 text-sm text-ink-soft/60">
        Every admin and brand-portal action — who did it, what changed, and when.
      </p>

      <form className="mt-5 flex flex-wrap items-end gap-3 rounded-xl3 border border-stone-150 bg-white p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-soft/60">Type</span>
          <select
            name="entityType"
            defaultValue={entityType ?? ""}
            className="rounded-md border border-stone-150 bg-white px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-ink/30"
          >
            <option value="">All</option>
            {Object.entries(ENTITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-soft/60">Actor</span>
          <input
            type="text"
            name="actor"
            defaultValue={actor ?? ""}
            placeholder="name or email"
            className="rounded-md border border-stone-150 bg-white px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-ink/30"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-soft/60">From</span>
          <input
            type="date"
            name="from"
            defaultValue={from ?? ""}
            className="rounded-md border border-stone-150 bg-white px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-ink/30"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-soft/60">To</span>
          <input
            type="date"
            name="to"
            defaultValue={to ?? ""}
            className="rounded-md border border-stone-150 bg-white px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-ink/30"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-ink px-4 py-2 text-[12.5px] font-semibold text-cream transition-transform hover:scale-[1.02]"
        >
          Filter
        </button>
        {hasFilters && (
          <Link
            href="/admin/audit-log"
            className="text-[12.5px] font-medium text-ink-soft/60 hover:text-ink hover:underline"
          >
            Clear filters
          </Link>
        )}
      </form>

      <div className="mt-6 divide-y divide-stone-150 rounded-xl3 border border-stone-150 bg-white">
        {logs.map((log) => (
          <details key={log.id} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-beige-100 px-2.5 py-1 text-[11px] font-semibold text-ink">
                  {ENTITY_LABELS[log.entityType] ?? log.entityType}
                </span>
                <span className="text-[13.5px] text-ink">{describeAuditLog(log)}</span>
              </div>
              <span className="whitespace-nowrap text-[12px] text-ink-soft/50">
                {new Date(log.createdAt).toLocaleString("en-US")}
              </span>
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 text-[12px] md:grid-cols-2">
              <div>
                <p className="mb-1 font-semibold uppercase tracking-wide text-ink-soft/40">
                  Before
                </p>
                <pre className="max-h-64 overflow-auto rounded-md bg-stone-50 p-3 text-ink-soft/70">
                  {JSON.stringify(log.beforeValue, null, 2) ?? "—"}
                </pre>
              </div>
              <div>
                <p className="mb-1 font-semibold uppercase tracking-wide text-ink-soft/40">
                  After
                </p>
                <pre className="max-h-64 overflow-auto rounded-md bg-stone-50 p-3 text-ink-soft/70">
                  {JSON.stringify(log.afterValue, null, 2) ?? "—"}
                </pre>
              </div>
            </div>
          </details>
        ))}

        {logs.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-ink-soft/60">
            {hasFilters ? "No actions match these filters." : "No actions recorded yet."}
          </p>
        )}
      </div>
    </div>
  );
}
