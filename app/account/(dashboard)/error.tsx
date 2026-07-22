"use client";

import { CircleAlert } from "lucide-react";
import { accountPrimaryButton } from "@/components/account/AccountUI";

export default function AccountError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[22px] border border-[var(--account-border)] bg-[var(--account-surface)] px-6 text-center shadow-[var(--account-shadow)]">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--account-danger)_12%,transparent)] text-[var(--account-danger)]">
        <CircleAlert className="h-5 w-5" />
      </span>
      <h1 className="mt-4 text-xl font-semibold text-[var(--account-text)]">We could not load this part of your account</h1>
      <p className="mt-2 max-w-md text-[13px] leading-6 text-[var(--account-text-muted)]">Your information is safe. Try loading the page again.</p>
      <button type="button" onClick={reset} className={`mt-5 ${accountPrimaryButton}`}>Try again</button>
    </div>
  );
}
