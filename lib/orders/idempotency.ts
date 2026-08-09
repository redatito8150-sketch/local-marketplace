import { createHash } from "node:crypto";

const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseOrderIdempotencyKey(key: string | null): string | null {
  if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) return null;
  return key.toLowerCase();
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

export function hashOrderRequest(value: unknown): string {
  const serialized = JSON.stringify(canonicalize(value));
  if (serialized === undefined) throw new TypeError("Order request is not serializable");
  return createHash("sha256").update(serialized).digest("hex");
}

export function buildOrderIdempotencyActor(
  userId: string | null,
  guestEmail: string
): string {
  if (userId) return `user:${userId}`;
  const guestDigest = createHash("sha256")
    .update(guestEmail.trim().toLowerCase())
    .digest("hex");
  return `guest:${guestDigest}`;
}
