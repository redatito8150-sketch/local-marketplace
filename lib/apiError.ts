import { NextResponse } from "next/server";
import { logError } from "@/lib/errorLog";
import { makeAppError, generateCorrelationId, CATEGORY_STATUS } from "@/lib/errors/appError";
import type { ErrorCategory } from "@/types";

// A raw Supabase/Postgres error message can carry internal schema/constraint
// details (column names, table names, constraint text) that shouldn't reach
// an API client. Use this at customer-facing route error sites instead of
// `NextResponse.json({ error: error.message }, ...)` — it still logs the
// real message server-side (and mirrors to Discord via logError) for
// debugging, but the client only ever sees a stable, generic message.
export function safeErrorResponse(
  context: string,
  error: { message: string },
  fallbackMessage = "Something went wrong. Please try again.",
  status = 500
) {
  logError(context, error.message);
  return NextResponse.json({ error: fallbackMessage }, { status });
}

// Category-aware upgrade of safeErrorResponse. Same safe-logging behavior
// (the real error, if any, only ever reaches logError/Discord), but the
// response body carries the full normalized AppError contract — category,
// retryable, optional fieldErrors/suggestedAction — instead of a bare
// string, so lib/errors/client.ts's parseApiError gets structured feedback.
// `error` (the field name) is always still present and still a string, so
// every existing `data.error` client read-site keeps working unchanged.
export function appErrorResponse(
  context: string,
  category: ErrorCategory,
  options: {
    error?: { message: string };
    userMessage?: string;
    fieldErrors?: Record<string, string>;
    status?: number;
  } = {}
) {
  if (options.error) logError(context, options.error.message);

  const correlationId = category === "unknown" ? generateCorrelationId() : undefined;
  const appError = makeAppError(category, {
    userMessage: options.userMessage,
    fieldErrors: options.fieldErrors,
    correlationId,
  });

  return NextResponse.json(
    {
      error: appError.userMessage,
      category: appError.category,
      retryable: appError.retryable,
      fieldErrors: appError.fieldErrors,
      suggestedAction: appError.suggestedAction,
      correlationId: appError.correlationId,
    },
    { status: options.status ?? CATEGORY_STATUS[category] }
  );
}
