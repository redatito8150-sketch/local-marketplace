"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { accountInputClass, accountPrimaryButton } from "@/components/account/AccountUI";

export default function SecuritySettingsForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) setError(updateError.message);
    else {
      setMessage("Your password has been updated.");
      setPassword("");
      setConfirmPassword("");
    }
    setSaving(false);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="text-[12.5px] font-medium text-[var(--account-text-muted)]">New password</span>
        <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required className={accountInputClass} />
      </label>
      <label className="block">
        <span className="text-[12.5px] font-medium text-[var(--account-text-muted)]">Confirm new password</span>
        <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required className={accountInputClass} />
      </label>
      {error && <p role="alert" className="rounded-xl bg-[color-mix(in_srgb,var(--account-danger)_12%,transparent)] px-4 py-3 text-[13px] font-medium text-[var(--account-danger)]">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-[color-mix(in_srgb,var(--account-success)_12%,transparent)] px-4 py-3 text-[13px] font-medium text-[var(--account-success)]">{message}</p>}
      <button type="submit" disabled={saving} className={accountPrimaryButton}>
        {saving ? "Updating password…" : "Update password"}
      </button>
    </form>
  );
}
