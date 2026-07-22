"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { accountInputClass, accountPrimaryButton } from "@/components/account/AccountUI";

export default function SettingsForm({
  initialFullName,
  initialPhone,
  initialEmail,
}: {
  initialFullName: string;
  initialPhone: string;
  initialEmail: string;
}) {
  const router = useRouter();

  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState(initialPhone);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  const [email, setEmail] = useState(initialEmail);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileError("");
    setProfileMessage("");
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProfileError(data.error ?? "Something went wrong");
        return;
      }
      setProfileMessage("Saved.");
      router.refresh();
    } catch {
      setProfileError("Something went wrong. Please try again.");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailSaving(true);
    setEmailError("");
    setEmailMessage("");
    const { error } = await supabase.auth.updateUser({ email });
    if (error) {
      setEmailError(error.message);
    } else {
      setEmailMessage("Check your inbox to confirm the new email address.");
    }
    setEmailSaving(false);
  };

  return (
    <div className="space-y-8">
      <form onSubmit={handleProfileSubmit} className="space-y-4">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--account-text)]">Your details</h2>
          <p className="mt-1 text-[12.5px] text-[var(--account-text-muted)]">Used for your account and order communication.</p>
        </div>
        <TextField label="Full name" value={fullName} onChange={setFullName} required />
        <TextField label="Phone" value={phone} onChange={setPhone} />
        {profileError && <FieldMessage tone="error">{profileError}</FieldMessage>}
        {profileMessage && <FieldMessage tone="success">{profileMessage}</FieldMessage>}
        <SubmitButton saving={profileSaving} label="Save Profile" />
      </form>

      <form onSubmit={handleEmailSubmit} className="space-y-4 border-t border-[var(--account-border)] pt-8">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--account-text)]">Email address</h2>
          <p className="mt-1 text-[12.5px] text-[var(--account-text-muted)]">Changing your email requires confirmation from your inbox.</p>
        </div>
        <TextField label="Email address" type="email" value={email} onChange={setEmail} required />
        {emailError && <FieldMessage tone="error">{emailError}</FieldMessage>}
        {emailMessage && <FieldMessage tone="success">{emailMessage}</FieldMessage>}
        <SubmitButton saving={emailSaving} label="Update Email" />
      </form>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-[var(--account-text-muted)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={accountInputClass}
      />
    </label>
  );
}

function FieldMessage({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  return (
    <p
      className={`rounded-md px-3.5 py-2.5 text-[13px] font-medium ${
        tone === "error"
          ? "bg-[color-mix(in_srgb,var(--account-danger)_12%,transparent)] text-[var(--account-danger)]"
          : "bg-[color-mix(in_srgb,var(--account-success)_12%,transparent)] text-[var(--account-success)]"
      }`}
    >
      {children}
    </p>
  );
}

function SubmitButton({ saving, label }: { saving: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={saving}
      className={accountPrimaryButton}
    >
      {saving ? "Saving…" : label}
    </button>
  );
}
