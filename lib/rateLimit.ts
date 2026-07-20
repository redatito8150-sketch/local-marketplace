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
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
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
