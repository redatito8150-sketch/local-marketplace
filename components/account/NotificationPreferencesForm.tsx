"use client";

import { useState } from "react";
import type { NotificationPreferences } from "@/types";

const TOGGLES: { key: keyof NotificationPreferences; label: string; description: string }[] = [
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

  const toggle = async (key: keyof NotificationPreferences) => {
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
    <div className="max-w-lg space-y-4">
      {TOGGLES.map((item) => (
        <div
          key={item.key}
          className="flex items-center justify-between gap-4 rounded-xl3 border border-stone-150 bg-white p-5"
        >
          <div>
            <p className="text-[14px] font-medium text-ink">{item.label}</p>
            <p className="mt-0.5 text-[12.5px] text-ink-soft/60">{item.description}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={preferences[item.key]}
            aria-label={item.label}
            disabled={saving}
            onClick={() => toggle(item.key)}
            className={`relative h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-60 ${
              preferences[item.key] ? "bg-ink" : "bg-stone-200"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                preferences[item.key] ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      ))}

      {error && (
        <p className="rounded-md bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}
      {message && !error && (
        <p className="rounded-md bg-stone-100 px-3.5 py-2.5 text-[13px] font-medium text-ink">
          {message}
        </p>
      )}
    </div>
  );
}
