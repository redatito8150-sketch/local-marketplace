type CachedOrder = { orderNumber: string; expiresAt: number };
const cache = new Map<string, CachedOrder>();
const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TTL_MS = 15 * 60 * 1000;

export function readOrderIdempotency(key: string | null) {
  if (!key || !KEY_PATTERN.test(key)) return null;
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.orderNumber;
}

export function storeOrderIdempotency(key: string | null, orderNumber: string) {
  if (!key || !KEY_PATTERN.test(key)) return;
  cache.set(key, { orderNumber, expiresAt: Date.now() + TTL_MS });
  if (cache.size > 500) {
    const now = Date.now();
    for (const [candidate, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(candidate);
    }
  }
}
