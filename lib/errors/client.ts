import type { AppError, ErrorCategory } from "../../types/index.ts";
import { makeAppError } from "./appError.ts";

const KNOWN_CATEGORIES: ReadonlySet<string> = new Set<ErrorCategory>([
  "validation",
  "authentication",
  "authorization",
  "conflict",
  "not_found",
  "rate_limit",
  "network",
  "timeout",
  "file_upload",
  "storage",
  "database_constraint",
  "server_unavailable",
  "external_provider",
  "unknown",
]);

function isErrorCategory(value: unknown): value is ErrorCategory {
  return typeof value === "string" && KNOWN_CATEGORIES.has(value);
}

function isFieldErrors(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).every((v) => typeof v === "string");
}

function inferCategoryFromStatus(status: number): ErrorCategory {
  switch (status) {
    case 400:
    case 422:
      return "validation";
    case 401:
      return "authentication";
    case 403:
      return "authorization";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 413:
    case 415:
      return "file_upload";
    case 429:
      return "rate_limit";
    case 502:
      return "external_provider";
    case 503:
      return "server_unavailable";
    case 504:
      return "timeout";
    default:
      return "unknown";
  }
}

// Turns an API JSON error body into a normalized AppError. Works whether
// the route already used appErrorResponse() (full structured body) or is
// an older/not-yet-migrated route that only ever returned `{ error }` —
// in the latter case the HTTP status still gives a reasonable category.
export function parseApiError(status: number, data: unknown): AppError {
  const body = (data ?? {}) as Record<string, unknown>;
  const category = isErrorCategory(body.category) ? body.category : inferCategoryFromStatus(status);
  return makeAppError(category, {
    userMessage: typeof body.error === "string" && body.error ? body.error : undefined,
    fieldErrors: isFieldErrors(body.fieldErrors) ? body.fieldErrors : undefined,
    retryable: typeof body.retryable === "boolean" ? body.retryable : undefined,
    suggestedAction: typeof body.suggestedAction === "string" ? body.suggestedAction : undefined,
    correlationId: typeof body.correlationId === "string" ? body.correlationId : undefined,
  });
}

type FetchAppErrorResult<T> = { ok: true; data: T } | { ok: false; error: AppError };

// fetch() wrapper that never throws — network failures, aborts/timeouts,
// and non-OK responses all come back as a normalized AppError instead of
// callers needing their own try/catch + status-check + JSON-parse dance.
// No caller in this codebase had any timeout/offline handling before this
// (see the loading/error discovery pass) — this is the shared primitive
// that closes that gap.
export async function fetchWithAppError<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number }
): Promise<FetchAppErrorResult<T>> {
  const { timeoutMs = 15000, ...rest } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, { ...rest, signal: rest.signal ?? controller.signal });
    clearTimeout(timer);

    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      // No/invalid JSON body — fine for a 204, otherwise handled below.
    }

    if (!response.ok) {
      return { ok: false, error: parseApiError(response.status, data) };
    }
    return { ok: true, data: data as T };
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: makeAppError("timeout") };
    }
    return { ok: false, error: makeAppError("network") };
  }
}
