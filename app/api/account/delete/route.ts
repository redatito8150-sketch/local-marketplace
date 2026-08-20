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

// supabaseAdmin.rpc(...) returns a thenable query builder, not a real
// Promise, so it has no .catch of its own to chain — this wraps it in one.
async function unlockAccountForDeletion(userId: string): Promise<void> {
  try {
    await supabaseAdmin.rpc("unlock_account_for_deletion", { p_user_id: userId });
  } catch {
    // Best-effort release — the 10-minute staleness window in
    // create_payment_attempt is the fallback if even this fails.
  }
}

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

  // Corrective pass 2, Section 3 (docs/audits/2026-08-20-production-
  // security-correctness-reliability-audit-en.md): the previous check here
  // was a plain SELECT, separate from the actual deletion — a card
  // checkout could create a fresh payment_attempt in the gap between this
  // read and auth.admin.deleteUser() below (classic time-of-check/time-of-
  // use). lock_account_for_deletion() takes a `for update` lock on this
  // user's profiles row and performs the SAME open-attempt check under
  // that lock; create_payment_attempt() takes the identical lock on the
  // identical row before creating anything, so the two can never both act
  // on a state that's already stale by the time either one commits.
  const { error: lockError } = await supabaseAdmin.rpc("lock_account_for_deletion", { p_user_id: user.id });
  if (lockError) {
    if (lockError.message?.startsWith("PAYMENT_ATTEMPT_IN_PROGRESS")) {
      return NextResponse.json(
        {
          error: "You have a payment in progress. Please wait for it to complete before deleting your account.",
          code: "PAYMENT_ATTEMPT_IN_PROGRESS",
        },
        { status: 409 }
      );
    }
    return safeErrorResponse("account.delete.lock", lockError);
  }

  // Preserves the accounting-relevant part of every payment_attempts row
  // this user ever created (item ids/prices/quantities), while destroying
  // the personal data inside shipping_snapshot (name/email/phone/address).
  // Must run before auth.admin.deleteUser() below — payment_attempts.
  // user_id becomes NULL the instant the auth user is gone (ON DELETE SET
  // NULL), which would make these rows impossible to find by user_id
  // afterward.
  const { error: redactError } = await supabaseAdmin.rpc("redact_deleted_account_payment_snapshots", {
    p_user_id: user.id,
  });
  if (redactError) {
    await unlockAccountForDeletion(user.id);
    return safeErrorResponse("account.delete.redact-payments", redactError);
  }

  let cleanupJobs;
  try {
    cleanupJobs = await queueAccountStorageCleanup(user.id);
  } catch (error) {
    await unlockAccountForDeletion(user.id);
    return safeErrorResponse("account.delete.queue-storage", error as Error);
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (error) {
    await discardStorageCleanupJobs(cleanupJobs.map((job) => job.id)).catch(() => undefined);
    await unlockAccountForDeletion(user.id);
    return safeErrorResponse("account.delete", error);
  }

  const cleanup = await processStorageCleanupJobs({ jobIds: cleanupJobs.map((job) => job.id) })
    .catch(() => ({ completed: 0, pending: cleanupJobs.length }));
  return NextResponse.json({ ok: true, cleanupPending: cleanup.pending > 0 });
}
