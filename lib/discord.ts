export type DiscordChannel = "notifications" | "auditLog" | "errors";

const WEBHOOK_URLS: Record<DiscordChannel, string | undefined> = {
  notifications: process.env.DISCORD_WEBHOOK_NOTIFICATIONS,
  auditLog: process.env.DISCORD_WEBHOOK_AUDIT_LOG,
  errors: process.env.DISCORD_WEBHOOK_ERRORS,
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
}): string {
  const lines = [`**\`${params.headline}\`**`];
  if (params.subline) lines.push(`**${params.subline}**`);
  for (const m of params.meta ?? []) {
    if (m.value) lines.push(`> ${m.label}: ${m.value}`);
  }
  if (params.detailBody) {
    lines.push("", `**\`${params.detailLabel ?? "Details"}\`**`, params.detailBody);
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
