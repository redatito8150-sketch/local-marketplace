import { normalizeOptionKey } from "@/lib/inventory/optionKey";

const RESERVED_KEYS = new Set(["color", "size"]);

export function validateOptionTypeName(name: string): string | null {
  if (!name?.trim()) return "Option name is required";
  const key = normalizeOptionKey(name);
  if (!key) return "Option name is required";
  if (RESERVED_KEYS.has(key)) return `"${name}" is a reserved option name`;
  return null;
}

export function validateOptionValueLabel(label: string): string | null {
  if (!label?.trim()) return "Value is required";
  return null;
}

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export function validateColorValueInput(input: {
  swatchType?: string;
  primaryColor?: string;
  secondaryColor?: string;
}): string | null {
  if (!input.swatchType) return null;
  if (!["single", "split", "multicolor"].includes(input.swatchType)) {
    return "Invalid swatch type";
  }
  if (input.swatchType === "single" && !(input.primaryColor && HEX_PATTERN.test(input.primaryColor))) {
    return "A valid primary color is required";
  }
  if (input.swatchType === "split") {
    if (!(input.primaryColor && HEX_PATTERN.test(input.primaryColor))) {
      return "A valid primary color is required";
    }
    if (!(input.secondaryColor && HEX_PATTERN.test(input.secondaryColor))) {
      return "A valid secondary color is required for a two-color swatch";
    }
  }
  return null;
}
