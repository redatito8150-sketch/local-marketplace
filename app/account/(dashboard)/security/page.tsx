import { redirect } from "next/navigation";
import { CheckCircle2, CircleAlert, Clock, KeyRound, MailCheck, Phone } from "lucide-react";
import { requireUser } from "@/lib/supabase/accountAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SMS_VERIFICATION_ENABLED } from "@/lib/sms";
import SecuritySettingsForm from "@/components/account/SecuritySettingsForm";
import PhoneVerificationForm from "@/components/account/PhoneVerificationForm";
import MfaSettingsForm from "@/components/account/MfaSettingsForm";
import SessionsList from "@/components/account/SessionsList";
import DeleteAccountButton from "@/components/account/DeleteAccountButton";
import { AccountPageHeader, AccountPanel } from "@/components/account/AccountUI";

export default async function AccountSecurityPage() {
  const user = await requireUser();
  if (!user) redirect("/account");
  const emailVerified = Boolean(user.email_confirmed_at);

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone, phone_verified_at")
    .eq("id", user.id)
    .maybeSingle();
  const phoneVerified = Boolean(profile?.phone_verified_at);

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
          value={profile?.phone ?? "No phone on file"}
          verified={phoneVerified}
          pendingLabel={!SMS_VERIFICATION_ENABLED ? "Verification coming soon" : undefined}
        />
      </div>

      {SMS_VERIFICATION_ENABLED ? (
        !phoneVerified && (
          <AccountPanel title="Verify your phone" description="Confirm your phone number with a one-time code sent by SMS.">
            <div className="max-w-xl p-5 sm:p-6">
              <PhoneVerificationForm initialPhone={profile?.phone ?? ""} />
            </div>
          </AccountPanel>
        )
      ) : (
        !phoneVerified && (
          <AccountPanel title="Verify your phone" description="SMS verification is coming soon.">
            <div className="flex items-start gap-3 p-5 sm:p-6">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--account-text-muted)]" strokeWidth={1.7} />
              <p className="text-[13px] text-[var(--account-text-muted)]">
                Phone verification will be available soon. You can keep using your account —
                signing in, browsing, checking out, and everything else — without it in the
                meantime.
              </p>
            </div>
          </AccountPanel>
        )
      )}

      <AccountPanel title="Change password" description="Use at least 8 characters and avoid reusing an old password.">
        <div className="max-w-xl p-5 sm:p-6">
          <SecuritySettingsForm />
        </div>
      </AccountPanel>

      <AccountPanel title="Two-factor authentication" description="Add an extra step at sign-in using an authenticator app. Optional — never required to use your account.">
        <div className="max-w-xl p-5 sm:p-6">
          <MfaSettingsForm />
        </div>
      </AccountPanel>

      <AccountPanel title="Devices" description="Browsers and devices that have signed in to your account.">
        <div className="max-w-xl p-5 sm:p-6">
          <SessionsList />
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

function SecurityStatus({
  icon: Icon,
  title,
  value,
  verified,
  pendingLabel,
}: {
  icon: typeof KeyRound;
  title: string;
  value: string;
  verified: boolean;
  /** Overrides the "Not verified" copy when verification isn't offered yet at all. */
  pendingLabel?: string;
}) {
  return (
    <div className="rounded-[20px] border border-[var(--account-border)] bg-[var(--account-surface)] p-5 shadow-[var(--account-shadow)]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--account-surface-muted)] text-[var(--account-accent)]">
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--account-text-muted)]">{title}</p>
          <p className="mt-1 truncate text-sm font-semibold text-[var(--account-text)]">{value}</p>
          <p className={`mt-2 flex items-center gap-1.5 text-[12px] font-semibold ${verified ? "text-[var(--account-success)]" : pendingLabel ? "text-[var(--account-text-muted)]" : "text-[var(--account-warning)]"}`}>
            {verified ? <CheckCircle2 className="h-4 w-4" /> : pendingLabel ? <Clock className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
            {verified ? "Verified" : pendingLabel ?? "Not verified"}
          </p>
        </div>
      </div>
    </div>
  );
}
