import { NextRequest, NextResponse } from "next/server";
import { processStorageCleanupJobs } from "@/lib/account/storageCleanup";
import { safeErrorResponse } from "@/lib/apiError";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const { data: abandonedQueued, error: queueError } = await supabaseAdmin.rpc("queue_abandoned_product_uploads", {
      p_older_than: "24 hours",
      p_limit: 100,
    });
    if (queueError) throw queueError;
    const storage = await processStorageCleanupJobs({ limit: 100 });
    return NextResponse.json({ ok: true, abandonedUploadsQueued: Number(abandonedQueued ?? 0), storage });
  } catch (error) {
    return safeErrorResponse("cron.storage-cleanup", error as Error);
  }
}
