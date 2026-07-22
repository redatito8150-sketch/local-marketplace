"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { accountInputClass, accountPrimaryButton } from "@/components/account/AccountUI";

export default function PhoneVerificationForm({ initialPhone }: { initialPhone: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/account/phone/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setStage("code");
      setMessage("A verification code has been sent.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/account/phone/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setMessage("Phone number verified.");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={stage === "phone" ? sendCode : verifyCode} className="space-y-4">
      <label className="block">
        <span className="text-[12.5px] font-medium text-[var(--account-text-muted)]">Phone number</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={stage === "code"}
          required
          className={accountInputClass}
        />
      </label>

      {stage === "code" && (
        <label className="block">
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
      )}

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

      <button type="submit" disabled={submitting} className={accountPrimaryButton}>
        {submitting
          ? "Please wait…"
          : stage === "phone"
          ? "Send verification code"
          : "Confirm code"}
      </button>
    </form>
  );
}
