import { NextRequest, NextResponse } from "next/server";
import { getRecentUserAuthState } from "@/lib/supabase/accountAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import {
  discardStorageCleanupJobs,
  processStorageCleanupJobs,
  queueAccountStorageCleanup,
} from "@/lib/account/storageCleanup";

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Database cascades remove account-only data. A BEFORE DELETE trigger removes
// authored reviews and redacts retained orders; queued Storage jobs remove
// public/private objects immediately or through the authenticated cron retry.
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const authState = await getRecentUserAuthState();
  if (authState.status === "unauthenticated") {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  if (authState.status === "recent_auth_required") {
    return NextResponse.json(
      { error: "Please sign in again before deleting your account.", code: "RECENT_AUTH_REQUIRED" },
      { status: 403 }
    );
  }
  if (authState.status !== "authenticated") {
    return NextResponse.json(
      { error: "We couldn't verify this sensitive action. Please try again.", code: "AUTH_ASSURANCE_UNAVAILABLE" },
      { status: 503 }
    );
  }

  const user = authState.user;
  // Deliberately tight: account deletion is irreversible and legitimately
  // happens at most once, so a burst here is always either a bug or an
  // attack on an already-hijacked session.
  if (!checkRateLimit(`account-delete:${user.id}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please try again later" }, { status: 429 });
  }

  // Audit finding PAY-02 (docs/audits/2026-08-20-production-security-
  // correctness-reliability-audit-en.md): payment_attempts.user_id is
  // ON DELETE CASCADE from auth.users. Deleting the account while a card
  // payment is still in flight (created/pending/processing/paid/
  // reflecting — not yet fulfilled, failed, expired, or cancelled) would
  // silently erase the one local record of that payment right before a
  // Paymob webhook needs it, leaving captured money with no order and no
  // local trail. Terminal-state attempts (fulfilled, fulfillment_failed,
  // failed, expired, cancelled) don't block deletion — nothing further can
  // happen to them.
  const { data: openAttempts, error: openAttemptsError } = await supabaseAdmin
    .from("payment_attempts")
    .select("id")
    .eq("user_id", user.id)
    .in("status", ["created", "pending", "processing", "paid", "reflecting"])
    .limit(1);
  if (openAttemptsError) {
    return safeErrorResponse("account.delete.check-payment-attempts", openAttemptsError);
  }
  if (openAttempts && openAttempts.length > 0) {
    return NextResponse.json(
      {
        error: "You have a payment in progress. Please wait for it to complete before deleting your account.",
        code: "PAYMENT_ATTEMPT_IN_PROGRESS",
      },
      { status: 409 }
    );
  }

  let cleanupJobs;
  try {
    cleanupJobs = await queueAccountStorageCleanup(user.id);
  } catch (error) {
    return safeErrorResponse("account.delete.queue-storage", error as Error);
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (error) {
    await discardStorageCleanupJobs(cleanupJobs.map((job) => job.id)).catch(() => undefined);
    return safeErrorResponse("account.delete", error);
  }

  const cleanup = await processStorageCleanupJobs({ jobIds: cleanupJobs.map((job) => job.id) })
    .catch(() => ({ completed: 0, pending: cleanupJobs.length }));
  return NextResponse.json({ ok: true, cleanupPending: cleanup.pending > 0 });
}
