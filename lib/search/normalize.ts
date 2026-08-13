const ARABIC_INDIC_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_INDIC_DIGITS[digit] ?? digit)
    .replace(/[‐‑‒–—―]/g, "-")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeReference(value: string) {
  return normalizeSearchText(value).replace(/[^a-z0-9]/g, "");
}
