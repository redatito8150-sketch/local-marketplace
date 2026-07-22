import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/accountAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import NotificationPreferencesForm from "@/components/account/NotificationPreferencesForm";
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
  const { data: profile } = await supabase
    .from("profiles")
    .select("notification_preferences")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="space-y-7">
      <AccountPageHeader eyebrow="Stay in the loop" title="Notifications" description="Choose the Mahaly emails that are useful to you. Essential account and security messages are always sent." />
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
