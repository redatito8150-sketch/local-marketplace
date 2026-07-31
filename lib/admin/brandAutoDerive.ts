// Pure derivation helpers for the one-click "Approve → Create Brand" flow
// (app/api/admin/applications/[id]/create-brand/route.ts) — split out so
// they're independently testable, same convention as the rest of
// lib/admin/*.

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "brand"
  );
}

export function baseSkuPrefix(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const base = letters.slice(0, 6);
  return base.length >= 2 ? base : `${base}XX`.slice(0, 2);
}

// attempt 0 = the plain base value; attempt >0 appends a numeric suffix.
export function slugVariant(base: string, attempt: number): string {
  return attempt === 0 ? base : `${base}-${attempt + 1}`;
}

// Same idea for the SKU prefix, but trimmed so the result always stays
// within the 2–6 char format the DB enforces.
export function skuVariant(base: string, attempt: number): string {
  if (attempt === 0) return base;
  const suffix = String(attempt + 1);
  const trimmed = base.slice(0, Math.max(2, 6 - suffix.length));
  return `${trimmed}${suffix}`;
}
