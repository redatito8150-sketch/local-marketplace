import { getBrandActivityNotifications } from "@/lib/data/admin";
import { NOTIFICATION_TYPE_LABELS } from "@/lib/admin/statuses";
import NotificationResolveActions from "@/components/admin/NotificationResolveActions";

const RESOLUTION_LABELS: Record<string, string> = {
  approved: "Approved",
  reverted: "Reverted",
};

// Instant-Publish: a brand owner/assistant's product changes go live the
// moment they save — this page is the admin's after-the-fact view of every
// one of those changes, not a pre-publish gate. Approve just acknowledges
// it; Revert undoes it via the linked audit log entry.
export default async function BrandActivityPage() {
  const activity = await getBrandActivityNotifications();
  const pendingCount = activity.filter((n) => n.resolution === "pending").length;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">Brand Activity</h1>
      <p className="mt-1.5 text-[13.5px] text-ink-soft/60">
        Every product a brand creates, edits, or removes goes live immediately — this is the
        record of what changed, with{" "}
        <span className="font-semibold text-ink">{pendingCount} awaiting a decision</span>.
      </p>

      <div className="mt-6 overflow-hidden rounded-xl3 border border-stone-150 bg-white">
        {activity.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-soft/60">
            No brand activity yet.
          </p>
        ) : (
          <div className="divide-y divide-stone-150">
            {activity.map((n) => (
              <div key={n.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft/50">
                    {NOTIFICATION_TYPE_LABELS[n.type] ?? n.type}
                  </p>
                  <p className="mt-0.5 text-[14px] font-medium text-ink">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-[12.5px] text-ink-soft/60">{n.body}</p>}
                  <p className="mt-1 text-[11.5px] text-ink-soft/40">
                    {new Date(n.createdAt).toLocaleString("en-US")}
                  </p>
                </div>
                {n.resolution === "pending" ? (
                  <NotificationResolveActions notificationId={n.id} />
                ) : (
                  <span className="flex-none rounded-full bg-stone-100 px-3 py-1 text-[11px] font-semibold text-ink-soft/60">
                    {RESOLUTION_LABELS[n.resolution] ?? n.resolution}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
