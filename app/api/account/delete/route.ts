import { NextRequest, NextResponse } from "next/server";
import { getRecentUserAuthState } from "@/lib/supabase/accountAuth";
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
