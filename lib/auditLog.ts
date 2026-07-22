import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendToDiscord, buildDiscordDescription, DISCORD_COLORS } from "@/lib/discord";
import { logError } from "@/lib/errorLog";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "status_change"
  | "bulk_archive"
  | "bulk_publish"
  | "bulk_delete"
  | "restock"
  | "role_change"
  // Brand-portal review workflow (Round 3)
  | "pause"
  | "unpause"
  | "request_deletion"
  | "approve"
  | "request_changes"
  | "reject_deletion"
  // Instant-publish (brand changes apply live, admin reviews after the
  // fact) — "archive" replaces the old delete-request gate, "revert"
  // is the admin undoing a brand-initiated create/update/archive.
  | "archive"
  | "revert"
  | "save_draft"
  | "discard_draft"
  | "reorder"
  | "publish"
  | "restore"
  | "upload_asset";

export type AuditEntityType =
  | "product"
  | "brand"
  | "order"
  | "application"
  | "profile"
  | "coupon"
  | "site_content"
  | "page";

// Green = something was added, red = something was removed, orange for
// everything else (edits, status flips, reverts). Used only for the
// Discord embed's color strip — has no bearing on the stored row.
const AUDIT_ACTION_COLORS: Record<AuditAction, number> = {
  create: DISCORD_COLORS.green,
  restock: DISCORD_COLORS.green,
  bulk_publish: DISCORD_COLORS.green,
  update: DISCORD_COLORS.orange,
  status_change: DISCORD_COLORS.orange,
  role_change: DISCORD_COLORS.orange,
  approve: DISCORD_COLORS.orange,
  request_changes: DISCORD_COLORS.orange,
  pause: DISCORD_COLORS.orange,
  unpause: DISCORD_COLORS.orange,
  revert: DISCORD_COLORS.orange,
  save_draft: DISCORD_COLORS.orange,
  discard_draft: DISCORD_COLORS.orange,
  reorder: DISCORD_COLORS.orange,
  publish: DISCORD_COLORS.green,
  restore: DISCORD_COLORS.orange,
  upload_asset: DISCORD_COLORS.green,
  delete: DISCORD_COLORS.red,
  bulk_delete: DISCORD_COLORS.red,
  archive: DISCORD_COLORS.red,
  bulk_archive: DISCORD_COLORS.red,
  request_deletion: DISCORD_COLORS.red,
  reject_deletion: DISCORD_COLORS.red,
};

// Plain-English past-tense verb per action, used to build the embed's bold
// headline (e.g. "Product added", "Order status changed").
const AUDIT_ACTION_VERBS: Record<AuditAction, string> = {
  create: "added",
  restock: "restocked",
  bulk_publish: "bulk published",
  update: "edited",
  status_change: "status changed",
  role_change: "role changed",
  approve: "approved",
  request_changes: "changes requested",
  pause: "paused",
  unpause: "unpaused",
  revert: "change reverted",
  save_draft: "draft saved",
  discard_draft: "draft discarded",
  reorder: "sections reordered",
  publish: "published",
  restore: "version restored",
  upload_asset: "asset uploaded",
  delete: "deleted",
  bulk_delete: "bulk deleted",
  archive: "archived",
  bulk_archive: "bulk archived",
  request_deletion: "deletion requested",
  reject_deletion: "deletion request rejected",
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

// Best-effort human name for the entity — every ProductInput/BrandInput
// snapshot carries a `.name`, so this reads naturally for the two entity
// types that make up nearly all activity; anything else falls back to
// showing the raw id twice rather than guessing at unfamiliar shapes.
function extractEntityName(before: unknown, after: unknown): string | null {
  const afterName = (after as { name?: unknown } | null)?.name;
  const beforeName = (before as { name?: unknown } | null)?.name;
  if (typeof afterName === "string" && afterName) return afterName;
  if (typeof beforeName === "string" && beforeName) return beforeName;
  return null;
}

// Mirrors notify()'s fire-and-forget contract in spirit — recording an
// audit entry is supplementary to the real write it's attached to, so a
// failure here is logged, never thrown, and never blocks that write. Still
// returns the inserted row's id (or null on failure) so a caller that also
// wants to attach a resolvable notification (Instant-Publish's Approve/
// Revert flow) can link the two together.
export async function logAudit(entry: {
  actorId: string | null;
  actorLabel: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
  // Denormalized tag (Round 3) so a brand's own /brand-portal/logs can
  // filter to just its own entries — set by every product/brand write path
  // that knows which brand it's touching. Never backfilled onto history.
  brandSlug?: string;
}): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("audit_logs")
    .insert({
      actor_id: entry.actorId,
      actor_label: entry.actorLabel,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      action: entry.action,
      before_value: entry.before ?? null,
      after_value: entry.after ?? null,
      brand_slug: entry.brandSlug ?? null,
    })
    .select("id")
    .single();
  if (error) {
    logError(`logAudit(${entry.entityType}/${entry.action}) failed`, error.message);
    return null;
  }

  // A short, human-readable summary, not the full before/after payload —
  // audit_logs itself is never pruned, so the DB (and the admin Audit Log
  // page's filters) already stays the complete record; this is a live feed
  // for visibility, not an archival backup.
  const entityName = extractEntityName(entry.before, entry.after);
  await sendToDiscord("auditLog", {
    description: buildDiscordDescription({
      headline: `${capitalize(entry.entityType)} ${AUDIT_ACTION_VERBS[entry.action]}`,
      subline: entityName ?? undefined,
      meta: [
        { label: `${capitalize(entry.entityType)} ID`, value: entry.entityId },
        { label: "User", value: entry.actorLabel },
        { label: "Brand", value: entry.brandSlug ?? "" },
      ],
    }),
    color: AUDIT_ACTION_COLORS[entry.action],
  });

  return data.id as string;
}
