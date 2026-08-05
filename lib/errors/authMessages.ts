import type { AppError } from "../../types/index.ts";
import { makeAppError } from "./appError.ts";
import { logError } from "../errorLog.ts";

type RawAuthError = { message: string; code?: string; status?: number };

// Called from context/AuthContext.tsx, a client component — logError()'s
// Discord mirror silently no-ops there (DISCORD_WEBHOOK_ERRORS is a
// server-only env var, undefined in the browser bundle by design), so the
// technical detail still reaches the browser console via logError's
// console.error but not the #errors Discord channel. Only server-side
// call sites (API routes) get the Discord mirror for free.
//
// Supabase Auth errors (`supabase.auth.*`) were being passed straight
// through as `error.message` to the UI everywhere (AuthContext.tsx) —
// including things like "Invalid login credentials" or "Password should
// be at least 6 characters" verbatim, which is Supabase's own internal
// wording, not reviewed copy for this product. This is the one place that
// maps a raw auth error to a safe, specific AppError; every auth call site
// should go through this instead of reading error.message directly.
//
// supabase-js's AuthError carries a stable `code` on most modern failures
// (added across 2.x releases) — matched first. Message-substring matching
// is kept as a fallback so an SDK version or edge case without a populated
// `code` doesn't silently fall through to the raw string.
export function normalizeAuthError(context: string, error: RawAuthError): AppError {
  const code = error.code;
  const message = error.message ?? "";
  const lower = message.toLowerCase();

  logError(context, `${code ?? "no-code"}: ${message}`);

  if (code === "invalid_credentials" || lower.includes("invalid login credentials")) {
    return makeAppError("authentication", {
      userMessage: "The email or password is incorrect.",
      retryable: true,
    });
  }

  if (code === "email_not_confirmed" || lower.includes("email not confirmed")) {
    return makeAppError("authentication", {
      userMessage: "Verify your email address before signing in.",
      suggestedAction: "resend_verification",
      retryable: false,
    });
  }

  if (code === "user_already_exists" || lower.includes("already registered") || lower.includes("already exists")) {
    return makeAppError("conflict", {
      userMessage: "An account already exists with this email. Sign in or reset your password.",
      retryable: false,
    });
  }

  if (
    code === "weak_password" ||
    lower.includes("password should be at least") ||
    lower.includes("password is too weak") ||
    lower.includes("password should contain")
  ) {
    return makeAppError("validation", {
      userMessage: "Choose a longer password that meets the requirements shown below.",
      fieldErrors: { password: "This password doesn't meet the requirements." },
      retryable: false,
    });
  }

  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    lower.includes("rate limit") ||
    lower.includes("too many requests")
  ) {
    return makeAppError("rate_limit");
  }

  if (code === "otp_expired" || lower.includes("expired")) {
    return makeAppError("authentication", {
      userMessage: "This link has expired. Request a new one.",
      retryable: false,
    });
  }

  if (code === "session_not_found" || lower.includes("session")) {
    return makeAppError("authentication", {
      userMessage: "Your session has expired. Sign in again.",
      retryable: false,
    });
  }

  if (code === "same_password") {
    return makeAppError("validation", {
      userMessage: "Choose a different password than your current one.",
      fieldErrors: { password: "This is the same as your current password." },
      retryable: false,
    });
  }

  return makeAppError("unknown", {
    userMessage: "We couldn't complete that. Try again.",
  });
}
