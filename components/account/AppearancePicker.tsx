"use client";

import { useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { ACCOUNT_THEMES } from "@/lib/account/themes";
import type { AccountTheme } from "@/types";
import { accountPrimaryButton } from "@/components/account/AccountUI";

export default function AppearancePicker({ initialTheme }: { initialTheme: AccountTheme }) {
  const [selected, setSelected] = useState<AccountTheme>(initialTheme);
  const [saved, setSaved] = useState<AccountTheme>(initialTheme);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const preview = (theme: AccountTheme) => {
    setSelected(theme);
    document.querySelector<HTMLElement>("[data-account-theme]")?.setAttribute("data-account-theme", theme);
    setMessage("");
    setError("");
  };

  const save = async () => {
    if (saving || selected === saved) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/account/appearance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: selected }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save your theme.");
      setSaved(selected);
      setMessage("Your account theme has been saved.");
    } catch (saveError) {
      preview(saved);
      setError(saveError instanceof Error ? saveError.message : "Could not save your theme.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <fieldset>
        <legend className="sr-only">Choose your account theme</legend>
        <div className="grid gap-4 lg:grid-cols-3">
          {ACCOUNT_THEMES.map((theme) => {
            const active = selected === theme.id;
            return (
              <label
                key={theme.id}
                className={`relative cursor-pointer rounded-[20px] border p-4 transition focus-within:ring-2 focus-within:ring-[var(--account-accent)]/30 ${
                  active
                    ? "border-[var(--account-accent)] bg-[var(--account-surface-muted)]"
                    : "border-[var(--account-border)] bg-[var(--account-surface)] hover:bg-[var(--account-surface-muted)]"
                }`}
              >
                <input
                  type="radio"
                  name="account-theme"
                  value={theme.id}
                  checked={active}
                  onChange={() => preview(theme.id)}
                  className="sr-only"
                />
                <div className="rounded-2xl border border-black/5 bg-white/70 p-3">
                  <div className="flex gap-2">
                    {theme.colors.map((color) => (
                      <span key={color} className="h-9 flex-1 rounded-xl" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                  <div className="mt-3 h-2 w-2/3 rounded-full" style={{ backgroundColor: theme.colors[2] }} />
                  <div className="mt-2 h-2 w-full rounded-full bg-black/10" />
                  <div className="mt-2 h-2 w-4/5 rounded-full bg-black/10" />
                </div>
                <div className="mt-4 flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      active
                        ? "border-[var(--account-accent)] bg-[var(--account-accent)] text-[var(--account-accent-foreground)]"
                        : "border-[var(--account-border)]"
                    }`}
                  >
                    {active && <Check className="h-3 w-3" strokeWidth={2.5} />}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-[var(--account-text)]">{theme.name}</span>
                    <span className="mt-1 block text-[12px] leading-5 text-[var(--account-text-muted)]">
                      {theme.description}
                    </span>
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="button" onClick={save} disabled={saving || selected === saved} className={accountPrimaryButton}>
          {saving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
          {saving ? "Saving theme…" : selected === saved ? "Theme saved" : "Save theme"}
        </button>
        {message && <p role="status" className="text-[13px] font-medium text-[var(--account-success)]">{message}</p>}
        {error && <p role="alert" className="text-[13px] font-medium text-[var(--account-danger)]">{error}</p>}
      </div>
    </div>
  );
}
