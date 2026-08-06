import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/accountAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import NotificationPreferencesForm from "@/components/account/NotificationPreferencesForm";
import MarkNotificationReadButton from "@/components/account/MarkNotificationReadButton";
import MarkAllNotificationsReadButton from "@/components/account/MarkAllNotificationsReadButton";
import { getNotificationsForUser } from "@/lib/data/userNotifications";
import type { NotificationPreferences } from "@/types";
import { AccountPageHeader, AccountPanel } from "@/components/account/AccountUI";
import { formatDateTime } from "@/lib/format";

const DEFAULT_PREFERENCES: NotificationPreferences = {
  orderUpdates: true,
  promotions: false,
  newsletter: false,
};

export default async function AccountNotificationsPage() {
  const user = await requireUser();
  if (!user) redirect("/account");

  const supabase = await createSupabaseServerClient();
  const [{ data: profile }, notifications] = await Promise.all([
    supabase.from("profiles").select("notification_preferences").eq("id", user.id).maybeSingle(),
    getNotificationsForUser(user.id),
  ]);
  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div className="space-y-7">
      <AccountPageHeader eyebrow="Stay in the loop" title="Notifications" description="Everything Mahaly needs to tell you, and the emails you want to hear from us." />
      <AccountPanel
        title="Recent activity"
        description="Order updates, application decisions, and other account activity."
        action={hasUnread ? <MarkAllNotificationsReadButton /> : undefined}
      >
        <div className="divide-y divide-[var(--account-border)]">
          {notifications.map((n) => {
            const href =
              n.relatedEntityType === "order" ? "/account/orders"
              : n.relatedEntityType === "application" ? "/join-as-a-brand/apply"
              // Back-in-stock and wishlist price-drop alerts both carry a
              // real product id — the whole point of the notification is
              // to get back to that exact product.
              : n.relatedEntityType === "product" && n.relatedEntityId ? `/product/${n.relatedEntityId}`
              : null;
            const info = (
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-[var(--account-text)]">{n.title}</p>
                {n.body && <p className="mt-1 text-[12.5px] text-[var(--account-text-muted)]">{n.body}</p>}
                <p className="mt-1.5 text-[11px] text-[var(--account-text-muted)]">
                  {formatDateTime(n.createdAt)}
                </p>
              </div>
            );
            return (
            <div key={n.id} className={`flex items-start justify-between gap-3 p-4 sm:p-5 ${n.read ? "" : "bg-[var(--account-surface-muted)]"}`}>
              {href ? <Link href={href} className="min-w-0 hover:underline">{info}</Link> : info}
              {!n.read && <MarkNotificationReadButton id={n.id} />}
            </div>
            );
          })}
          {notifications.length === 0 && (
            <p className="p-4 text-[13px] text-[var(--account-text-muted)] sm:p-5">No notifications yet.</p>
          )}
        </div>
      </AccountPanel>
      <AccountPanel title="Email preferences" description="Changes are saved as soon as you switch an option.">
        <div className="p-4 sm:p-5">
        <NotificationPreferencesForm
          initial={profile?.notification_preferences ?? DEFAULT_PREFERENCES}
        />
        </div>
      </AccountPanel>
      </div>
  );
}
