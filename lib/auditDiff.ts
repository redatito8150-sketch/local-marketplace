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
const IGNORED_FIELDS = new Set(["id", "created_at", "createdAt", "updated_at", "updatedAt"]);

function toPlainRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
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
  const beforeRec = toPlainRecord(before);
  const afterRec = toPlainRecord(after);
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
