import { getAllNotificationsForAdmin } from "@/lib/data/admin";
import { NOTIFICATION_TYPE_LABELS } from "@/lib/admin/statuses";
import MarkNotificationReadButton from "@/components/admin/MarkNotificationReadButton";
import MarkAllNotificationsReadButton from "@/components/admin/MarkAllNotificationsReadButton";
import NotificationResolveActions from "@/components/admin/NotificationResolveActions";

const RESOLUTION_LABELS: Record<string, string> = {
  approved: "Approved",
  reverted: "Reverted",
};

export default async function AdminNotificationsPage() {
  const notifications = await getAllNotificationsForAdmin();
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tightest text-ink">
          Notifications ({notifications.length})
        </h1>
        {unreadCount > 0 && <MarkAllNotificationsReadButton />}
      </div>

      <div className="mt-8 divide-y divide-stone-150 rounded-xl3 border border-stone-150 bg-white">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`flex items-center justify-between gap-4 px-5 py-4 ${
              n.read ? "" : "bg-beige-50/50"
            }`}
          >
            <div className="flex items-start gap-3">
              {!n.read && <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-ink" />}
              <div className={n.read ? "pl-5" : ""}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft/50">
                  {NOTIFICATION_TYPE_LABELS[n.type] ?? n.type}
                </p>
                <p className="mt-0.5 text-[14px] font-medium text-ink">{n.title}</p>
                {n.body && <p className="mt-0.5 text-[12.5px] text-ink-soft/60">{n.body}</p>}
                <p className="mt-1 text-[11.5px] text-ink-soft/40">
                  {new Date(n.createdAt).toLocaleString("en-US")}
                </p>
              </div>
            </div>
            {n.resolution === "pending" ? (
              <NotificationResolveActions notificationId={n.id} />
            ) : n.resolution === "approved" || n.resolution === "reverted" ? (
              <span className="flex-none rounded-full bg-stone-100 px-3 py-1 text-[11px] font-semibold text-ink-soft/60">
                {RESOLUTION_LABELS[n.resolution]}
              </span>
            ) : (
              !n.read && <MarkNotificationReadButton id={n.id} />
            )}
          </div>
        ))}

        {notifications.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-ink-soft/60">No notifications yet.</p>
        )}
      </div>
    </div>
  );
}
