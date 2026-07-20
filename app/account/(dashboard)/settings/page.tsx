import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/accountAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SettingsForm from "@/components/account/SettingsForm";
import DeleteAccountButton from "@/components/account/DeleteAccountButton";

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
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">Settings</h1>
      <p className="mt-1 text-[13.5px] text-ink-soft/60">
        Manage your profile, email, and password.
      </p>

      <div className="mt-8">
        <SettingsForm
          initialFullName={profile?.full_name ?? ""}
          initialPhone={profile?.phone ?? ""}
          initialEmail={user.email ?? ""}
        />
      </div>

      <div className="mt-10">
        <DeleteAccountButton />
      </div>
    </div>
  );
}
