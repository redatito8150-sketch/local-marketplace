// Small hand-rolled CSV serializer — a single well-known format doesn't
// justify a new dependency, consistent with the project's lean footprint.
export function toCsv<T extends object>(
  rows: T[],
  columns: { key: keyof T; label: string }[]
): string {
  const escape = (value: unknown): string => {
    let str = value == null ? "" : String(value);
    // Rows here can carry customer-typed text (shipping name/city, etc.) —
    // a cell starting with =, +, -, or @ is interpreted as a formula by
    // Excel/Sheets when the file is opened ("CSV/Formula Injection"), so a
    // leading apostrophe neutralizes it as plain text without changing how
    // the value displays.
    if (/^[=+\-@]/.test(str)) {
      str = `'${str}`;
    }
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = columns.map((c) => escape(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => escape(row[c.key])).join(","));
  return [header, ...lines].join("\r\n");
}
