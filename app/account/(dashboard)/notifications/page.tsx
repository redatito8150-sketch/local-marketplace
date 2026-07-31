import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/accountAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import NotificationPreferencesForm from "@/components/account/NotificationPreferencesForm";
import MarkNotificationReadButton from "@/components/account/MarkNotificationReadButton";
import MarkAllNotificationsReadButton from "@/components/account/MarkAllNotificationsReadButton";
import { getNotificationsForUser } from "@/lib/data/userNotifications";
import type { NotificationPreferences } from "@/types";
import { AccountPageHeader, AccountPanel } from "@/components/account/AccountUI";

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
          {notifications.map((n) => (
            <div key={n.id} className={`flex items-start justify-between gap-3 p-4 sm:p-5 ${n.read ? "" : "bg-[var(--account-surface-muted)]"}`}>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-[var(--account-text)]">{n.title}</p>
                {n.body && <p className="mt-1 text-[12.5px] text-[var(--account-text-muted)]">{n.body}</p>}
                <p className="mt-1.5 text-[11px] text-[var(--account-text-muted)]">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
              </div>
              {!n.read && <MarkNotificationReadButton id={n.id} />}
            </div>
          ))}
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
