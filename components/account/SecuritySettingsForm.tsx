"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { accountInputClass, accountPrimaryButton } from "@/components/account/AccountUI";
import PasswordInput from "@/components/shared/PasswordInput";

export default function SecuritySettingsForm() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
    if (!user?.email) {
      setError("Couldn't determine your account email — please refresh and try again.");
      return;
    }

    setSaving(true);

    // Re-verify the caller actually knows the current password before
    // changing it — updateUser() alone would let anyone with just an
    // open/hijacked session change the password with no proof of identity.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (reauthError) {
      setError(
        reauthError.message.toLowerCase().includes("credentials")
          ? "Current password is incorrect."
          : reauthError.message
      );
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
    } else {
      setMessage("Your password has been updated.");
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
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
      {error && <p role="alert" className="rounded-xl bg-[color-mix(in_srgb,var(--account-danger)_12%,transparent)] px-4 py-3 text-[13px] font-medium text-[var(--account-danger)]">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-[color-mix(in_srgb,var(--account-success)_12%,transparent)] px-4 py-3 text-[13px] font-medium text-[var(--account-success)]">{message}</p>}
      <button type="submit" disabled={saving} className={accountPrimaryButton}>
        {saving ? "Updating password…" : "Update password"}
      </button>
    </form>
  );
}
