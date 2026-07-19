// Small hand-rolled CSV serializer — a single well-known format doesn't
// justify a new dependency, consistent with the project's lean footprint.
export function toCsv<T extends object>(
  rows: T[],
  columns: { key: keyof T; label: string }[]
): string {
  const escape = (value: unknown): string => {
    const str = value == null ? "" : String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = columns.map((c) => escape(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => escape(row[c.key])).join(","));
  return [header, ...lines].join("\r\n");
}
