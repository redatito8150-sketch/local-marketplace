"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ContactInfoContent } from "@/types";

export default function ContactInfoForm({ initial }: { initial: ContactInfoContent }) {
  const router = useRouter();
  const [supportEmail, setSupportEmail] = useState(initial.supportEmail);
  const [supportPhone, setSupportPhone] = useState(initial.supportPhone);
  const [address, setAddress] = useState(initial.address);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSaved(false);

    const value: ContactInfoContent = {
      supportEmail: supportEmail.trim(),
      supportPhone: supportPhone.trim(),
      address: address.trim(),
    };

    try {
      const res = await fetch("/api/admin/site-content/contact_info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset to the original default contact info? This can't be undone.")) return;
    setResetting(true);
    try {
      await fetch("/api/admin/site-content/contact_info", { method: "DELETE" });
      window.location.reload();
    } finally {
      setResetting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5 rounded-xl3 border border-stone-150 bg-white p-5">
      <h2 className="text-[14px] font-semibold text-ink">Contact Info</h2>

      <div>
        <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
          Support email <span className="text-red-600">*</span>
        </label>
        <input
          type="email"
          value={supportEmail}
          onChange={(e) => setSupportEmail(e.target.value)}
          className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
          Support phone <span className="text-red-600">*</span>
        </label>
        <input
          type="text"
          value={supportPhone}
          onChange={(e) => setSupportPhone(e.target.value)}
          className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
          Address <span className="text-red-600">*</span>
        </label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
        />
      </div>

      {error && <p className="text-[13px] text-red-600">{error}</p>}
      {saved && !error && <p className="text-[13px] text-green-700">Saved.</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-ink px-5 py-2.5 text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02] disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className="rounded-md border border-stone-150 px-4 py-2.5 text-[13px] font-semibold text-ink-soft/70 transition-colors hover:bg-stone-100 disabled:opacity-60"
        >
          {resetting ? "Resetting…" : "Reset to default"}
        </button>
      </div>
    </form>
  );
}
