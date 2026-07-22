import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/accountAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SettingsForm from "@/components/account/SettingsForm";
import AvatarUploader from "@/components/account/AvatarUploader";
import { AccountPageHeader, AccountPanel } from "@/components/account/AccountUI";

export default async function AccountSettingsPage() {
  const user = await requireUser();
  if (!user) redirect("/account");

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="space-y-7">
      <AccountPageHeader
        eyebrow="Your account"
        title="Personal information"
        description="Keep your name, photo, phone, and email up to date. These details stay private to your account and orders."
      />
      <AccountPanel>
        <div className="space-y-8 p-5 sm:p-6">
          <AvatarUploader
            name={profile?.full_name || user.email || "Your account"}
            initialUrl={typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null}
          />
        <SettingsForm
          initialFullName={profile?.full_name ?? ""}
          initialPhone={profile?.phone ?? ""}
          initialEmail={user.email ?? ""}
        />
        </div>
      </AccountPanel>
      </div>
  );
}
