// Mirrors the SQL key/token derivation used to seed system option values
// (20260731000001) — kept in sync deliberately so a brand's custom option/
// value normalizes the exact same way the seeded system ones do.
export function normalizeOptionKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function deriveSkuToken(label: string): string {
  return label.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 10);
}
