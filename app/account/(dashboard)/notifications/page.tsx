import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/accountAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import NotificationPreferencesForm from "@/components/account/NotificationPreferencesForm";
import type { NotificationPreferences } from "@/types";

const DEFAULT_PREFERENCES: NotificationPreferences = {
  orderUpdates: true,
  promotions: false,
  newsletter: false,
};

export default async function AccountNotificationsPage() {
  const user = await requireUser();
  if (!user) redirect("/account");

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("notification_preferences")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">Notifications</h1>
      <p className="mt-1 text-[13.5px] text-ink-soft/60">
        Choose what LOCAL emails you about.
      </p>

      <div className="mt-8">
        <NotificationPreferencesForm
          initial={profile?.notification_preferences ?? DEFAULT_PREFERENCES}
        />
      </div>
    </div>
  );
}
