"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

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

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

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

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordMessage("");
    if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setPasswordError(error.message);
    } else {
      setPasswordMessage("Password updated.");
      setPassword("");
      setConfirmPassword("");
    }
    setPasswordSaving(false);
  };

  return (
    <div className="max-w-lg space-y-10">
      <form onSubmit={handleProfileSubmit} className="space-y-4">
        <h2 className="text-[15px] font-semibold text-ink">Profile</h2>
        <TextField label="Full name" value={fullName} onChange={setFullName} required />
        <TextField label="Phone" value={phone} onChange={setPhone} />
        {profileError && <FieldMessage tone="error">{profileError}</FieldMessage>}
        {profileMessage && <FieldMessage tone="success">{profileMessage}</FieldMessage>}
        <SubmitButton saving={profileSaving} label="Save Profile" />
      </form>

      <form onSubmit={handleEmailSubmit} className="space-y-4 border-t border-stone-150 pt-8">
        <h2 className="text-[15px] font-semibold text-ink">Email</h2>
        <TextField label="Email address" type="email" value={email} onChange={setEmail} required />
        {emailError && <FieldMessage tone="error">{emailError}</FieldMessage>}
        {emailMessage && <FieldMessage tone="success">{emailMessage}</FieldMessage>}
        <SubmitButton saving={emailSaving} label="Update Email" />
      </form>

      <form onSubmit={handlePasswordSubmit} className="space-y-4 border-t border-stone-150 pt-8">
        <h2 className="text-[15px] font-semibold text-ink">Password</h2>
        <TextField
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          required
        />
        <TextField
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          required
        />
        {passwordError && <FieldMessage tone="error">{passwordError}</FieldMessage>}
        {passwordMessage && <FieldMessage tone="success">{passwordMessage}</FieldMessage>}
        <SubmitButton saving={passwordSaving} label="Update Password" />
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
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
      />
    </label>
  );
}

function FieldMessage({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  return (
    <p
      className={`rounded-md px-3.5 py-2.5 text-[13px] font-medium ${
        tone === "error" ? "bg-red-50 text-red-700" : "bg-stone-100 text-ink"
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
      className="rounded-md bg-ink px-6 py-3 text-[13.5px] font-semibold text-cream transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {saving ? "Saving…" : label}
    </button>
  );
}
