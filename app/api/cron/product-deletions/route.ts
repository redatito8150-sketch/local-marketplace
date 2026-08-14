import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { executeDueProductDeletions } from "@/lib/admin/productDeletion";
import { logAudit } from "@/lib/auditLog";
import { notify, notifyUser } from "@/lib/notify";
import { safeErrorResponse } from "@/lib/apiError";

// The scheduled-deletion cron executor. Authenticated exactly like the
// existing /api/cron/storage-cleanup route (a bearer-token CRON_SECRET,
// never reachable by an ordinary user) — never exposed as a user-facing
// action. Processes a bounded batch of due schedules, each row locked via
// `for update skip locked` inside the RPC itself, so two overlapping cron
// invocations can never delete the same product twice (see
// private.execute_due_product_deletions in supabase/migrations/
// 20260814020000_product_deletion_lifecycle.sql for the full concurrency
// design).
//
// Audit/notification only ever fires from the RPC's own reported
// `results` — never before the database transaction that actually deleted
// (or blocked) each schedule has committed, so there is no risk of a
// "deleted successfully" notification going out for something that
// didn't actually happen.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const outcome = await executeDueProductDeletions(25);

    const results = outcome.results as Array<{
      scheduleId: string;
      productId?: string | null;
      outcome: "completed" | "blocked" | "error";
      blockers?: unknown;
      error?: string;
    }>;

    if (results.length > 0) {
      const scheduleIds = results.map((r) => r.scheduleId);
      const { data: schedules } = await supabaseAdmin
        .from("product_deletion_schedules")
        .select("id, product_name, brand_id, brand_slug:brands(slug), initiated_by")
        .in("id", scheduleIds);
      const scheduleById = new Map((schedules ?? []).map((s) => [s.id, s]));

      for (const result of results) {
        const schedule = scheduleById.get(result.scheduleId);
        const productName = schedule?.product_name ?? result.productId ?? "product";
        const brandSlug = (schedule?.brand_slug as unknown as { slug?: string } | null)?.slug ?? undefined;

        if (result.outcome === "completed" && result.productId) {
          const auditLogId = await logAudit({
            actorId: null,
            actorLabel: "system:cron",
            entityType: "product",
            entityId: result.productId,
            action: "product_permanently_deleted",
            before: { name: productName, id: result.productId },
            brandSlug,
          });
          await notify(
            "product_permanently_deleted",
            `Scheduled deletion completed: ${productName}`,
            "",
            { relatedEntityType: "product", relatedEntityId: result.productId, auditLogId, actorLabel: "Automatic (scheduled)" }
          );
          if (schedule?.initiated_by) {
            await notifyUser(
              schedule.initiated_by as string,
              "product_permanently_deleted",
              "Scheduled deletion completed",
              `${productName} has been permanently deleted.`,
              { relatedEntityType: "product", relatedEntityId: result.productId }
            );
          }
        } else if (result.outcome === "blocked" && result.productId) {
          const auditLogId = await logAudit({
            actorId: null,
            actorLabel: "system:cron",
            entityType: "product",
            entityId: result.productId,
            action: "product_deletion_schedule_blocked",
            after: { blockers: result.blockers },
            brandSlug,
          });
          await notify(
            "product_deletion_schedule_blocked",
            `Scheduled deletion blocked by new activity: ${productName}`,
            "",
            { relatedEntityType: "product", relatedEntityId: result.productId, auditLogId, actorLabel: "Automatic (scheduled)" }
          );
          if (schedule?.initiated_by) {
            await notifyUser(
              schedule.initiated_by as string,
              "product_deletion_schedule_blocked",
              "Scheduled deletion paused",
              `${productName}'s scheduled deletion was paused because new activity means it can no longer be safely deleted.`,
              { relatedEntityType: "product", relatedEntityId: result.productId }
            );
          }
        }
      }
    }

    return NextResponse.json({ ok: true, ...outcome });
  } catch (error) {
    return safeErrorResponse("cron.product-deletions", error as Error);
  }
}
