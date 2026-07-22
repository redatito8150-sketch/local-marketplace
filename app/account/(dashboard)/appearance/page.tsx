import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/accountAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { accountThemeFromPreferences } from "@/lib/account/themes";
import AppearancePicker from "@/components/account/AppearancePicker";
import { AccountPageHeader, AccountPanel } from "@/components/account/AccountUI";
import type { NotificationPreferences } from "@/types";

export default async function AccountAppearancePage() {
  const user = await requireUser();
  if (!user) redirect("/account");
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("notification_preferences")
    .eq("id", user.id)
    .maybeSingle();
  const theme = accountThemeFromPreferences(
    profile?.notification_preferences as NotificationPreferences | null,
  );

  return (
    <div className="space-y-7">
      <AccountPageHeader
        eyebrow="Make it yours"
        title="Appearance"
        description="Choose the color mood that feels most comfortable. Your choice applies only to your personal account pages."
      />
      <AccountPanel title="Choose your theme" description="Preview a theme instantly, then save it to use on every visit.">
        <div className="p-5 sm:p-6">
          <AppearancePicker initialTheme={theme} />
        </div>
      </AccountPanel>
    </div>
  );
}
