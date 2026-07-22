"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { accountInputClass, accountPrimaryButton } from "@/components/account/AccountUI";

interface EnrolledFactor {
  id: string;
}

export default function MfaSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [factor, setFactor] = useState<EnrolledFactor | null>(null);
  const [enrollment, setEnrollment] = useState<{ factorId: string; qrCode: string; secret: string } | null>(
    null
  );
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = data?.totp?.find((f) => f.status === "verified");
    setFactor(verified ? { id: verified.id } : null);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const startEnrollment = async () => {
    setBusy(true);
    setError("");
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEnrollment({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    });
  };

  const confirmEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollment) return;
    setBusy(true);
    setError("");
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: enrollment.factorId,
    });
    if (challengeError) {
      setError(challengeError.message);
      setBusy(false);
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enrollment.factorId,
      challengeId: challenge.id,
      code,
    });
    setBusy(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    setEnrollment(null);
    setCode("");
    setMessage("Two-factor authentication is enabled.");
    refresh();
  };

  const disable = async () => {
    if (!factor) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMessage("Two-factor authentication is disabled.");
    refresh();
  };

  if (loading) return null;

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-xl bg-[color-mix(in_srgb,var(--account-danger)_12%,transparent)] px-4 py-3 text-[13px] font-medium text-[var(--account-danger)]">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-xl bg-[color-mix(in_srgb,var(--account-success)_12%,transparent)] px-4 py-3 text-[13px] font-medium text-[var(--account-success)]">
          {message}
        </p>
      )}

      {factor && !enrollment && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-[13px] font-medium text-[var(--account-text)]">
            Two-factor authentication is enabled on your account.
          </p>
          <button type="button" disabled={busy} onClick={disable} className="text-[12.5px] font-semibold text-[var(--account-danger)] hover:underline disabled:opacity-50">
            Disable
          </button>
        </div>
      )}

      {!factor && !enrollment && (
        <button type="button" disabled={busy} onClick={startEnrollment} className={accountPrimaryButton}>
          Enable authenticator app
        </button>
      )}

      {enrollment && (
        <form onSubmit={confirmEnrollment} className="space-y-4">
          <p className="text-[13px] text-[var(--account-text-muted)]">
            Scan this QR code with your authenticator app, then enter the 6-digit code it shows.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrollment.qrCode} alt="Authenticator QR code" className="h-40 w-40" />
          <p className="text-[11.5px] text-[var(--account-text-muted)]">
            Can&apos;t scan? Enter this code manually: <span className="font-mono">{enrollment.secret}</span>
          </p>
          <label className="block max-w-[200px]">
            <span className="text-[12.5px] font-medium text-[var(--account-text-muted)]">Verification code</span>
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              className={accountInputClass}
            />
          </label>
          <button type="submit" disabled={busy} className={accountPrimaryButton}>
            {busy ? "Verifying…" : "Confirm"}
          </button>
        </form>
      )}
    </div>
  );
}
