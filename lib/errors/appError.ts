import type { AppError, ErrorCategory } from "../../types/index.ts";

// Safe-by-default copy per category — used whenever a call site doesn't
// supply a more specific userMessage. Never technical, never references
// internal systems.
const DEFAULT_MESSAGES: Record<ErrorCategory, string> = {
  validation: "Some of the information you entered isn't valid.",
  authentication: "Sign in to continue.",
  authorization: "You don't have permission to do that.",
  conflict: "This was changed elsewhere. Reload and try again.",
  not_found: "We couldn't find what you were looking for.",
  rate_limit: "Too many attempts. Wait a moment before trying again.",
  network: "We couldn't connect. Check your internet connection and try again.",
  timeout: "This request took too long. Try again.",
  file_upload: "This file couldn't be uploaded.",
  storage: "We couldn't save that file. Try again.",
  database_constraint: "That change couldn't be saved.",
  server_unavailable: "The service is temporarily unavailable. Try again shortly.",
  external_provider: "The external service didn't respond. Try again.",
  unknown: "Something unexpected happened. Try again.",
};

// Categories where a plain retry is a sensible next action by default.
// Individual call sites can still override via makeAppError's `retryable`.
const RETRYABLE_CATEGORIES: ReadonlySet<ErrorCategory> = new Set([
  "network",
  "timeout",
  "server_unavailable",
  "external_provider",
  "rate_limit",
  "unknown",
]);

// Default HTTP status per category for server responses built via
// lib/apiError.ts's appErrorResponse(). Routes can still pass an explicit
// status to override (e.g. file_upload is 413 for "too large" but 415 for
// "unsupported type" — same category, different concrete cause).
export const CATEGORY_STATUS: Record<ErrorCategory, number> = {
  validation: 400,
  authentication: 401,
  authorization: 403,
  conflict: 409,
  not_found: 404,
  rate_limit: 429,
  network: 400,
  timeout: 504,
  file_upload: 413,
  storage: 500,
  database_constraint: 409,
  server_unavailable: 503,
  external_provider: 502,
  unknown: 500,
};

export function makeAppError(category: ErrorCategory, overrides: Partial<Omit<AppError, "category">> = {}): AppError {
  return {
    category,
    userMessage: overrides.userMessage || DEFAULT_MESSAGES[category],
    fieldErrors: overrides.fieldErrors,
    retryable: overrides.retryable ?? RETRYABLE_CATEGORIES.has(category),
    suggestedAction: overrides.suggestedAction,
    correlationId: overrides.correlationId,
  };
}

// Short, human-readable reference code for the "unknown" category — never
// a UUID (too long to read aloud/type into a support message), never
// derived from anything sensitive. Purely a lookup key for cross-referencing
// against the Discord-mirrored technical log from the same request.
export function generateCorrelationId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return id;
}
