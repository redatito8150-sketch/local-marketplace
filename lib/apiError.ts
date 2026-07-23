import { NextResponse } from "next/server";
import { logError } from "@/lib/errorLog";

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
