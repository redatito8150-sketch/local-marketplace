import { NextRequest, NextResponse } from "next/server";
import { processStorageCleanupJobs } from "@/lib/account/storageCleanup";
import { archiveExpiredProductDrafts } from "@/lib/admin/dailyMaintenance";
import { safeErrorResponse } from "@/lib/apiError";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const [storage, archivedDrafts] = await Promise.all([
      processStorageCleanupJobs({ limit: 100 }),
      archiveExpiredProductDrafts(),
    ]);
    return NextResponse.json({ ok: true, storage, archivedDrafts });
  } catch (error) {
    return safeErrorResponse("cron.storage-cleanup", error as Error);
  }
}
