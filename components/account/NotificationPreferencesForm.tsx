"use client";

import { useState } from "react";
import type { NotificationPreferences } from "@/types";

type NotificationToggleKey = "orderUpdates" | "promotions" | "newsletter";

const TOGGLES: { key: NotificationToggleKey; label: string; description: string }[] = [
  {
    key: "orderUpdates",
    label: "Order updates",
    description: "Shipping, delivery, and order status changes.",
  },
  {
    key: "promotions",
    label: "Promotions",
    description: "Sales, discount codes, and limited-time offers.",
  },
  {
    key: "newsletter",
    label: "Newsletter",
    description: "New Egyptian brands and journal stories, monthly.",
  },
];

export default function NotificationPreferencesForm({
  initial,
}: {
  initial: NotificationPreferences;
}) {
  const [preferences, setPreferences] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const toggle = async (key: NotificationToggleKey) => {
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/account/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Something went wrong");
        setPreferences(preferences);
        return;
      }
      setMessage("Saved.");
    } catch {
      setError("Something went wrong. Please try again.");
      setPreferences(preferences);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-3">
      {TOGGLES.map((item) => (
        <div
          key={item.key}
          className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--account-border)] bg-[var(--account-surface)] p-5"
        >
          <div>
            <p className="text-[14px] font-medium text-[var(--account-text)]">{item.label}</p>
            <p className="mt-0.5 text-[12.5px] text-[var(--account-text-muted)]">{item.description}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={preferences[item.key]}
            aria-label={item.label}
            disabled={saving}
            onClick={() => toggle(item.key)}
            className={`relative h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-60 ${
              preferences[item.key] ? "bg-[var(--account-accent)]" : "bg-[var(--account-border)]"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-[var(--account-surface)] shadow-sm transition-transform ${
                preferences[item.key] ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      ))}

      {error && (
        <p role="alert" className="rounded-xl bg-[color-mix(in_srgb,var(--account-danger)_12%,transparent)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--account-danger)]">
          {error}
        </p>
      )}
      {message && !error && (
        <p role="status" className="rounded-xl bg-[color-mix(in_srgb,var(--account-success)_12%,transparent)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--account-success)]">
          {message}
        </p>
      )}
    </div>
  );
}
