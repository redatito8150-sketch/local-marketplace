// Shared by ProductForm's submit payload and the live-preview mapping so
// the "one item per line" / "comma-separated" parsing rule only lives in
// one place and can never drift between what gets saved and what's shown.

export function parseLines(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseCsv(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
