import { NextResponse } from "next/server";
import { logError } from "@/lib/errorLog";
import { resolveReplenishmentError } from "@/lib/warehouse/replenishmentErrors";

// Thin NextResponse wrapper around the pure resolveReplenishmentError — kept
// in its own file (rather than folded into replenishmentErrors.ts) purely so
// that module has zero import-time dependency on next/server and can be
// unit-tested directly; route files should import from here instead.
export function replenishmentErrorResponse(context: string, error: { message: string }) {
  const resolved = resolveReplenishmentError(error.message);
  if (!resolved.isKnown) {
    logError(context, error.message);
  }
  return NextResponse.json({ error: resolved.userMessage, code: resolved.code }, { status: resolved.status });
}
