import { NextRequest } from "next/server";

// A plain in-memory counter, not a distributed one — on Vercel each
// serverless instance holds its own Map, so a burst spread across cold
// starts/instances isn't caught with perfect accuracy. Still meaningfully
// raises the bar over no limiting at all (repeat requests hitting the same
// warm instance, which is the common case for a single bad actor script),
// without pulling in Redis/Upstash for a project this size. Revisit if this
// app ever needs guarantees across multiple instances.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function getClientIp(request: NextRequest): string {
  // `x-vercel-forwarded-for` is set by Vercel's edge network itself and
  // cannot be supplied or overridden by the client — the most trustworthy
  // signal when deployed there. `x-forwarded-for` can be prepended with
  // arbitrary client-supplied values, but proxies only ever *append*, never
  // rewrite, earlier entries — so the last hop is Vercel's own observed
  // client IP, not attacker-controlled, whereas the first hop is. Falling
  // back to the first hop (as before) would let a client spoof a fresh
  // bucket key on every request and defeat rate limiting entirely.
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwardedFor) return vercelForwardedFor.split(",")[0].trim();

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const hops = forwardedFor.split(",").map((hop) => hop.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

// Returns true if the call should proceed, false if the caller is over
// `limit` requests within `windowMs`. `key` should combine a route name and
// the caller's IP so different endpoints don't share a budget.
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}
