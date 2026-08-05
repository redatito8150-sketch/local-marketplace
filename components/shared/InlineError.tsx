"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import type { AppError } from "@/types";

// Single shared "something failed" banner — replaces the ad-hoc
// `<p className="rounded-md bg-red-50 ...">{error}</p>` blocks that used to
// be hand-copied into every form (forgot-password, reset-password,
// checkout, product editor, brand application, ...). Always announces to
// assistive tech (role="alert" + aria-live) — most of those hand-copied
// blocks never did.
export default function InlineError({
  error,
  onRetry,
  className = "",
}: {
  error: AppError | string;
  onRetry?: () => void;
  className?: string;
}) {
  const message = typeof error === "string" ? error : error.userMessage;
  const showRetry = typeof error !== "string" && error.retryable && onRetry;
  const correlationId = typeof error !== "string" ? error.correlationId : undefined;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex items-start gap-2.5 rounded-md bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700 ${className}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
      <div className="flex-1">
        <p>{message}</p>
        {correlationId ? <p className="mt-0.5 text-[11px] font-normal text-red-700/70">Reference: {correlationId}</p> : null}
      </div>
      {showRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-red-700 transition hover:bg-red-100"
        >
          <RefreshCw className="h-3 w-3" strokeWidth={2} aria-hidden />
          Retry
        </button>
      ) : null}
    </div>
  );
}
