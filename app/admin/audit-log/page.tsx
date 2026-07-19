import { redirect } from "next/navigation";
import { getAllAuditLogsForAdmin } from "@/lib/data/admin";
import { requireStaffRole } from "@/lib/supabase/adminAuth";

const ACTION_LABELS: Record<string, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  status_change: "Status changed",
  bulk_archive: "Bulk archived",
  bulk_publish: "Bulk published",
  bulk_delete: "Bulk deleted",
  restock: "Restocked",
  role_change: "Role changed",
};

const ENTITY_LABELS: Record<string, string> = {
  product: "Product",
  brand: "Brand",
  order: "Order",
  application: "Application",
  profile: "User",
  coupon: "Coupon",
  site_content: "Site content",
};

function diffPreview(before: unknown, after: unknown): string | null {
  if (before == null && after == null) return null;
  // Keep this a short, scannable one-liner — the full JSON is available in
  // the <details> panel below for anyone who needs the exact values.
  if (before == null) return "Created";
  if (after == null) return "Removed";
  return "Changed";
}

export default async function AdminAuditLogPage() {
  const staff = await requireStaffRole("admin");
  if (!staff) redirect("/admin");

  const logs = await getAllAuditLogsForAdmin();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">
        Audit Log ({logs.length})
      </h1>
      <p className="mt-1 text-sm text-ink-soft/60">
        Every admin action — who did it, what changed, and when.
      </p>

      <div className="mt-8 divide-y divide-stone-150 rounded-xl3 border border-stone-150 bg-white">
        {logs.map((log) => (
          <details key={log.id} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-beige-100 px-2.5 py-1 text-[11px] font-semibold text-ink">
                  {ENTITY_LABELS[log.entityType] ?? log.entityType}
                </span>
                <span className="text-[13.5px] font-medium text-ink">
                  {ACTION_LABELS[log.action] ?? log.action}
                </span>
                <span className="text-[12.5px] text-ink-soft/50">{log.entityId}</span>
                {diffPreview(log.beforeValue, log.afterValue) && (
                  <span className="text-[12px] text-ink-soft/40">
                    {diffPreview(log.beforeValue, log.afterValue)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-[12px] text-ink-soft/50">
                <span>{log.actorLabel}</span>
                <span>{new Date(log.createdAt).toLocaleString("en-US")}</span>
              </div>
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
            No actions recorded yet.
          </p>
        )}
      </div>
    </div>
  );
}
