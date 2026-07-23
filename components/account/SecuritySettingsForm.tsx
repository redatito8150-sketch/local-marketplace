"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { accountInputClass, accountPrimaryButton } from "@/components/account/AccountUI";
import PasswordInput from "@/components/shared/PasswordInput";
import CaptchaWidget, { type CaptchaWidgetHandle } from "@/components/account/CaptchaWidget";

const CAPTCHA_REQUIRED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

export default function SecuritySettingsForm() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const captchaRef = useRef<CaptchaWidgetHandle>(null);

  const resetCaptcha = () => {
    captchaRef.current?.reset();
    setCaptchaToken("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!currentPassword) {
      setError("Enter your current password to confirm this change.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    if (CAPTCHA_REQUIRED && !captchaToken) {
      setError("Please complete the verification challenge");
      return;
    }
    if (!user?.email) {
      setError("Couldn't determine your account email — please refresh and try again.");
      return;
    }

    setSaving(true);

    // Re-verify the caller actually knows the current password before
    // changing it — updateUser() alone would let anyone with just an
    // open/hijacked session change the password with no proof of identity.
    // This goes through the same signInWithPassword() endpoint Attack
    // Protection gates, so it needs a captcha token too when that's enabled.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
      options: { captchaToken: captchaToken || undefined },
    });

    if (reauthError) {
      setError(
        reauthError.message.toLowerCase().includes("credentials")
          ? "Current password is incorrect."
          : reauthError.message
      );
      resetCaptcha();
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      resetCaptcha();
    } else {
      setMessage("Your password has been updated.");
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      resetCaptcha();
    }
    setSaving(false);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="text-[12.5px] font-medium text-[var(--account-text-muted)]">Current password</span>
        <PasswordInput
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
          required
          inputClassName={`${accountInputClass} pr-11`}
          wrapperClassName="relative mt-1.5"
          toggleClassName="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--account-text-muted)] hover:text-[var(--account-text)]"
        />
      </label>
      <label className="block">
        <span className="text-[12.5px] font-medium text-[var(--account-text-muted)]">New password</span>
        <PasswordInput
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          required
          inputClassName={`${accountInputClass} pr-11`}
          wrapperClassName="relative mt-1.5"
          toggleClassName="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--account-text-muted)] hover:text-[var(--account-text)]"
        />
      </label>
      <label className="block">
        <span className="text-[12.5px] font-medium text-[var(--account-text-muted)]">Confirm new password</span>
        <PasswordInput
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          required
          inputClassName={`${accountInputClass} pr-11`}
          wrapperClassName="relative mt-1.5"
          toggleClassName="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--account-text-muted)] hover:text-[var(--account-text)]"
        />
      </label>
      <CaptchaWidget ref={captchaRef} onToken={setCaptchaToken} />
      {error && <p role="alert" className="rounded-xl bg-[color-mix(in_srgb,var(--account-danger)_12%,transparent)] px-4 py-3 text-[13px] font-medium text-[var(--account-danger)]">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-[color-mix(in_srgb,var(--account-success)_12%,transparent)] px-4 py-3 text-[13px] font-medium text-[var(--account-success)]">{message}</p>}
      <button type="submit" disabled={saving} className={accountPrimaryButton}>
        {saving ? "Updating password…" : "Update password"}
      </button>
    </form>
  );
}
