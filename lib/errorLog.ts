import { sendToDiscord, buildDiscordDescription, DISCORD_COLORS } from "@/lib/discord";

// Drop-in replacement for a bare console.error at every "this failed, but
// don't throw" site in the codebase — keeps the exact same local server-log
// visibility and additionally mirrors it to the #errors Discord channel, so
// a real failure doesn't go unnoticed just because no one was watching the
// server console when it happened.
export function logError(context: string, message: string): void {
  console.error(`${context}:`, message);
  void sendToDiscord("errors", {
    description: buildDiscordDescription({
      headline: `⚠️ ${context}`,
      detailBody: message,
    }),
    color: DISCORD_COLORS.red,
  });
}
