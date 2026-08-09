export function resolveTrustedApiBaseUrl(
  rawBaseUrl: string | undefined,
  allowedHost: string | undefined,
  allowLocalHttp = false,
): string {
  if (!rawBaseUrl || !allowedHost) throw new Error("Mahaly API origin is not configured.");
  const url = new URL(rawBaseUrl);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.hostname !== allowedHost || (url.protocol !== "https:" && !(allowLocalHttp && local))) {
    throw new Error("Mahaly API origin is not trusted.");
  }
  if (url.username || url.password || url.search || url.hash) throw new Error("Mahaly API origin is invalid.");
  return url.origin;
}
