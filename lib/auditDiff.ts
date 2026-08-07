// Generic field-level differ shared by the website's Audit Log page and
// the Discord audit embeds — one source of truth for "what actually
// changed," instead of the raw `JSON.stringify(before/after)` dumps this
// replaces. Works on whatever shape a given write route happens to log
// (some pass full DB rows, some pass narrow single-field objects) since it
// just unions the keys present on either side rather than assuming a
// fixed schema per entity type.

export interface AuditFieldChange {
  field: string;
  // Absent on a create (nothing "from"), absent on a delete (nothing "to").
  from?: string;
  to?: string;
}

// Fields that change on virtually every write (bookkeeping, not a real
// change a human cares about) or that duplicate the id already shown
// elsewhere in the embed/page — dropped so the diff stays signal, not noise.
// The second group is product/brand bookkeeping that's set by the system
// on nearly every write (review state, timestamps, staging leftovers) and
// isn't part of what a human actually edited — real noise, not signal.
const IGNORED_FIELDS = new Set([
  "id", "createdAt", "updatedAt",
  "reviewedBy", "reviewedAt", "submittedBy", "pausedByBrand", "pendingChanges",
  "sourceApplicationId", "optionSelections",
]);

function toPlainRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

// snake_case (raw DB rows) and camelCase (API input shapes) both feed this
// differ, often for the SAME logical field on opposite sides of one call
// (e.g. `discount_percent` in a `before` DB row vs `discountPercent` in an
// `after` API payload). Without normalizing, those look like two unrelated
// keys — one "added", one "removed" — which is exactly the noisy "shows
// everything as changed even when only one field moved" bug this fixes.
function normalizeKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function normalizeRecord(rec: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rec)) out[normalizeKey(key)] = value;
  return out;
}

export function humanizeFieldLabel(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase -> "camel Case"
    .replace(/_/g, " "); // snake_case -> "snake case"
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString("en-US");
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.map((item) => (typeof item === "object" ? JSON.stringify(item) : String(item))).join(", ");
  }
  if (typeof value === "object") {
    const json = JSON.stringify(value);
    return json.length > 200 ? `${json.slice(0, 200)}…` : json;
  }
  return String(value);
}

// `before`/`after` are whatever shape the caller happened to log (see
// lib/auditLog.ts's callers — full row, narrow patch object, or absent
// entirely for a pure create/delete). Only real, meaningful changes make
// it into the result: a key present on both sides with the identical
// stringified value is dropped, and IGNORED_FIELDS is always dropped.
export function diffEntitySnapshots(before: unknown, after: unknown): AuditFieldChange[] {
  const beforeRec = normalizeRecord(toPlainRecord(before));
  const afterRec = normalizeRecord(toPlainRecord(after));
  const keys = new Set([...Object.keys(beforeRec), ...Object.keys(afterRec)]);
  const changes: AuditFieldChange[] = [];

  for (const key of keys) {
    if (IGNORED_FIELDS.has(key)) continue;
    const hasBefore = key in beforeRec;
    const hasAfter = key in afterRec;
    if (hasBefore && hasAfter && JSON.stringify(beforeRec[key]) === JSON.stringify(afterRec[key])) continue;

    const field = humanizeFieldLabel(key);
    if (before === undefined) {
      // Pure create — nothing existed before, so every field in `after`
      // is just "set to X", not a from → to change.
      changes.push({ field, to: formatFieldValue(afterRec[key]) });
    } else if (after === undefined) {
      // Pure delete — show what existed, not a change.
      changes.push({ field, from: formatFieldValue(beforeRec[key]) });
    } else {
      changes.push({
        field,
        from: hasBefore ? formatFieldValue(beforeRec[key]) : undefined,
        to: hasAfter ? formatFieldValue(afterRec[key]) : undefined,
      });
    }
  }

  return changes;
}

// Fields on a variant snapshot that aren't human-relevant on their own (the
// combination is already expressed via the SKU/option labels) — dropped so
// a variant's diff line reads "Quantity: 5 → 8", not a wall of ids.
const VARIANT_IGNORED_FIELDS = new Set([
  "id", "createdAt", "updatedAt", "optionValues", "optionValueIds", "productId", "sku",
]);

interface VariantLike {
  id?: string;
  sku?: string;
  [key: string]: unknown;
}

// Per-variant diff for a product edit, keyed by the variant's real SKU —
// never its UUID. Matches by `id` where both sides have one (an existing,
// previously-saved variant); anything only on one side is a plain
// add/remove line, since there's nothing to diff it against. Accepts
// `unknown[]` since callers pass two structurally different shapes (a
// saved ProductVariant vs. the form's VariantRowInput) that don't share an
// index signature — this is a diff helper, not a type contract.
export function diffVariantList(before: unknown[] | undefined, after: unknown[] | undefined): string {
  const beforeList = (before ?? []) as VariantLike[];
  const afterList = (after ?? []) as VariantLike[];
  const beforeById = new Map(beforeList.filter((v) => v.id).map((v) => [v.id as string, v]));
  const afterById = new Map(afterList.filter((v) => v.id).map((v) => [v.id as string, v]));
  const lines: string[] = [];

  const strip = (v: VariantLike): VariantLike => {
    const copy: VariantLike = {};
    for (const [key, value] of Object.entries(v)) {
      if (!VARIANT_IGNORED_FIELDS.has(normalizeKey(key))) copy[key] = value;
    }
    return copy;
  };

  for (const [id, b] of beforeById) {
    const a = afterById.get(id);
    const label = (b.sku as string) ?? id;
    if (!a) {
      lines.push(`${label}: removed`);
      continue;
    }
    const changes = diffEntitySnapshots(strip(b), strip(a));
    for (const c of changes) {
      if (c.from !== undefined && c.to !== undefined) lines.push(`${label} — ${c.field}: ${c.from} → ${c.to}`);
    }
  }
  for (const [id, a] of afterById) {
    if (!beforeById.has(id)) lines.push(`${(a.sku as string) ?? id}: added`);
  }
  for (const a of afterList) {
    if (!a.id) lines.push(`${(a.sku as string) ?? "new variant"}: added`);
  }

  return lines.join("\n");
}

// Plain-text rendering for the Discord embed's detail block — one line
// per changed field.
export function formatDiffAsText(changes: AuditFieldChange[]): string | undefined {
  if (changes.length === 0) return undefined;
  return changes
    .map((c) => {
      if (c.from !== undefined && c.to !== undefined) return `${c.field}: ${c.from} → ${c.to}`;
      if (c.to !== undefined) return `${c.field}: ${c.to}`;
      return `${c.field}: ${c.from}`;
    })
    .join("\n");
}
