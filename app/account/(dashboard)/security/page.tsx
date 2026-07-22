import { redirect } from "next/navigation";
import { CheckCircle2, CircleAlert, KeyRound, MailCheck, Phone } from "lucide-react";
import { requireUser } from "@/lib/supabase/accountAuth";
import SecuritySettingsForm from "@/components/account/SecuritySettingsForm";
import DeleteAccountButton from "@/components/account/DeleteAccountButton";
import { AccountPageHeader, AccountPanel } from "@/components/account/AccountUI";

export default async function AccountSecurityPage() {
  const user = await requireUser();
  if (!user) redirect("/account");
  const emailVerified = Boolean(user.email_confirmed_at);
  const phoneVerified = Boolean(user.phone_confirmed_at);

  return (
    <div className="space-y-7">
      <AccountPageHeader
        eyebrow="Account protection"
        title="Security"
        description="Review your verified contact details and update your password safely."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SecurityStatus
          icon={MailCheck}
          title="Email"
          value={user.email ?? "No email"}
          verified={emailVerified}
        />
        <SecurityStatus
          icon={Phone}
          title="Phone"
          value={user.phone ?? "No verified phone"}
          verified={phoneVerified}
        />
      </div>

      <AccountPanel title="Change password" description="Use at least 8 characters and avoid reusing an old password.">
        <div className="max-w-xl p-5 sm:p-6">
          <SecuritySettingsForm />
        </div>
      </AccountPanel>

      <AccountPanel title="Delete account" description="This permanently removes your sign-in and personal profile. Past orders remain anonymized for transaction records.">
        <div className="p-5 sm:p-6">
          <DeleteAccountButton />
        </div>
      </AccountPanel>
    </div>
  );
}

function SecurityStatus({ icon: Icon, title, value, verified }: { icon: typeof KeyRound; title: string; value: string; verified: boolean }) {
  return (
    <div className="rounded-[20px] border border-[var(--account-border)] bg-[var(--account-surface)] p-5 shadow-[var(--account-shadow)]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--account-surface-muted)] text-[var(--account-accent)]">
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--account-text-muted)]">{title}</p>
          <p className="mt-1 truncate text-sm font-semibold text-[var(--account-text)]">{value}</p>
          <p className={`mt-2 flex items-center gap-1.5 text-[12px] font-semibold ${verified ? "text-[var(--account-success)]" : "text-[var(--account-warning)]"}`}>
            {verified ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
            {verified ? "Verified" : "Not verified"}
          </p>
        </div>
      </div>
    </div>
  );
}
