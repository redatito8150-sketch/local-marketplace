// The single "auditLog" channel this project started with is now ten
// category-specific channels — one per kind of activity — so the owner
// can watch (or mute) e.g. #audit-orders separately from #audit-products
// in Discord, instead of one firehose channel for every entity type.
// #notifications and #errors are deliberately NOT split — those stay
// single channels.
export type DiscordChannel =
  | "notifications"
  | "errors"
  | "auditProducts"
  | "auditBrands"
  | "auditOrders"
  | "auditApplications"
  | "auditUsersRoles"
  | "auditCollections"
  | "auditInventory"
  | "auditProductOptions"
  | "auditReviews"
  | "auditSiteMarketing";

const WEBHOOK_URLS: Record<DiscordChannel, string | undefined> = {
  notifications: process.env.DISCORD_WEBHOOK_NOTIFICATIONS,
  errors: process.env.DISCORD_WEBHOOK_ERRORS,
  auditProducts: process.env.DISCORD_WEBHOOK_AUDIT_PRODUCTS,
  auditBrands: process.env.DISCORD_WEBHOOK_AUDIT_BRANDS,
  auditOrders: process.env.DISCORD_WEBHOOK_AUDIT_ORDERS,
  auditApplications: process.env.DISCORD_WEBHOOK_AUDIT_APPLICATIONS,
  auditUsersRoles: process.env.DISCORD_WEBHOOK_AUDIT_USERS_ROLES,
  auditCollections: process.env.DISCORD_WEBHOOK_AUDIT_COLLECTIONS,
  auditInventory: process.env.DISCORD_WEBHOOK_AUDIT_INVENTORY,
  auditProductOptions: process.env.DISCORD_WEBHOOK_AUDIT_PRODUCT_OPTIONS,
  auditReviews: process.env.DISCORD_WEBHOOK_AUDIT_REVIEWS,
  auditSiteMarketing: process.env.DISCORD_WEBHOOK_AUDIT_SITE_MARKETING,
};

// Decimal RGB values Discord's embed `color` field expects — shared across
// every caller so "green means added, orange means edited, red means
// removed" reads the same in every channel.
export const DISCORD_COLORS = {
  green: 0x2ecc71,
  orange: 0xe67e22,
  red: 0xe74c3c,
} as const;

// Discord's own hard limit on an embed's description field.
const MAX_DESCRIPTION_LENGTH = 4096;

export function sanitizeDiscordText(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/https?:\/\/\S+/gi, "[link removed]")
    .replace(/([\\`*_{}\[\]()<>#+\-.!|~])/g, "\\$1")
    .replace(/\s{3,}/g, "  ")
    .trim();
}

export interface DiscordEmbed {
  description: string;
  color: number;
}

// Shared line-builder so both notify() and logAudit() produce the same
// visual structure: a bold monospace headline, optional blockquoted meta
// lines (an entity id, who did it), then an optional labeled detail block
// (e.g. a before/after diff). Kept here rather than duplicated in both
// callers.
export function buildDiscordDescription(params: {
  headline: string;
  subline?: string;
  meta?: { label: string; value: string }[];
  detailLabel?: string;
  detailBody?: string;
  // An absolute URL to the entity's real page on the site (see
  // lib/admin/entityLinks.ts) — rendered as a normal markdown link so
  // Discord makes it clickable, instead of just quoting the raw ID and
  // making the reader go search for it themselves.
  link?: { label: string; url: string };
}): string {
  const lines = [`**\`${sanitizeDiscordText(params.headline)}\`**`];
  if (params.subline) lines.push(`**${sanitizeDiscordText(params.subline)}**`);
  for (const m of params.meta ?? []) {
    if (m.value) lines.push(`> ${sanitizeDiscordText(m.label)}: ${sanitizeDiscordText(m.value)}`);
  }
  if (params.detailBody) {
    lines.push("", `**\`${sanitizeDiscordText(params.detailLabel ?? "Details")}\`**`, sanitizeDiscordText(params.detailBody));
  }
  if (params.link) {
    const safeUrl = /^https:\/\/[a-z0-9.-]+(?::\d+)?\//i.test(params.link.url) ? params.link.url : null;
    if (safeUrl) lines.push("", `[${sanitizeDiscordText(params.link.label)}](${safeUrl})`);
  }
  return lines.join("\n");
}

// A one-way mirror to an external, unbounded archive — never the source of
// truth. Never throws (a Discord outage must never break the real write
// path it's attached to), and silently no-ops until the corresponding
// DISCORD_WEBHOOK_* env var is set, so this is safe to call from day one.
// Awaited by callers (with a short timeout) rather than truly detached,
// since an unawaited promise can get dropped when a serverless function
// returns before it settles.
export async function sendToDiscord(channel: DiscordChannel, embed: DiscordEmbed): Promise<void> {
  const url = WEBHOOK_URLS[channel];
  if (!url) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            description: embed.description.slice(0, MAX_DESCRIPTION_LENGTH),
            color: embed.color,
            timestamp: new Date().toISOString(),
          },
        ],
        // Embed descriptions carry customer/applicant-typed text (shipping
        // name, brand application fields) verbatim — without this, a value
        // like "@everyone" would ping the whole server. Suppresses every
        // mention type; nothing this app sends is meant to page anyone.
        allowed_mentions: { parse: [] },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    // Deliberately a bare console.error, not logError() — that would mirror
    // to the #errors channel via this exact function, risking a loop if
    // Discord itself is the thing that's down.
    console.error(`sendToDiscord(${channel}) failed:`, err instanceof Error ? err.message : err);
  } finally {
    clearTimeout(timeout);
  }
}
