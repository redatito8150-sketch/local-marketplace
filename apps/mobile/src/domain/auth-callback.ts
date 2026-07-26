export type AuthCallback =
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "code"; code: string }
  | null;

export function parseAuthCallback(url: string): AuthCallback {
  try {
    const parsed = new URL(url.replace("#", url.includes("?") ? "&" : "?"));
    const accessToken = parsed.searchParams.get("access_token");
    const refreshToken = parsed.searchParams.get("refresh_token");
    if (accessToken && refreshToken) return { kind: "tokens", accessToken, refreshToken };
    const code = parsed.searchParams.get("code");
    return code ? { kind: "code", code } : null;
  } catch {
    return null;
  }
}
