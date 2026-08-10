const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export const TOTP_CODE_LENGTH = 6;

export function normalizeTotpCode(input: string): string {
  return Array.from(input)
    .map((character) => {
      const arabicIndicIndex = ARABIC_INDIC_DIGITS.indexOf(character);
      if (arabicIndicIndex >= 0) return String(arabicIndicIndex);

      const easternArabicIndex = EASTERN_ARABIC_DIGITS.indexOf(character);
      if (easternArabicIndex >= 0) return String(easternArabicIndex);

      return character;
    })
    .join("")
    .replace(/\D/g, "")
    .slice(0, TOTP_CODE_LENGTH);
}

export function isCompleteTotpCode(input: string): boolean {
  return new RegExp(`^\\d{${TOTP_CODE_LENGTH}}$`).test(input);
}
