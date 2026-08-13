// Derives a soft, tasteful radial-gradient background for the New Arrivals
// theater section from a product's swatch hex — never a flat/solid fill.
// Saturation is deliberately compressed into a pastel band so the effect
// stays "premium editorial" even for very saturated or near-neutral swatches.

export const DEFAULT_THEATER_GRADIENT =
  "radial-gradient(circle at 50% 30%, #fffdfb 0%, #f8efea 45%, #f3e9e3 100%)";

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace("#", "").trim();
  const expanded = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return null;
  const value = parseInt(expanded, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l: l * 100 };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// The soft radial glow that sits behind the active theater card — same
// alpha/stop structure as the original fixed-amber version, just recolored
// to the active product's swatch so the glow and the section background
// always read as one cohesive tint.
// "at 50% 50%" instead of the "center" keyword, and no explicit "ellipse"
// keyword (it's the CSS default for radial-gradient) — Framer Motion's
// gradient interpolator only reliably preserves numeric/percentage tokens
// while animating between two gradient strings, and silently drops
// keyword-only segments like "ellipse at center".
export const DEFAULT_THEATER_GLOW =
  "radial-gradient(at 50% 50%, rgba(200,89,86,.22) 0%, rgba(173,126,116,.12) 40%, rgba(111,87,77,.05) 62%, transparent 78%)";

export function theaterGlowFromHex(hex: string | undefined): string {
  const rgb = hex ? hexToRgb(hex) : null;
  if (!rgb) return DEFAULT_THEATER_GLOW;
  const { r, g, b } = rgb;
  return `radial-gradient(at 50% 50%, rgba(${r},${g},${b},.26) 0%, rgba(${r},${g},${b},.14) 40%, rgba(${r},${g},${b},.05) 62%, transparent 78%)`;
}

export function theaterGradientFromHex(hex: string | undefined): string {
  if (!hex) return DEFAULT_THEATER_GRADIENT;
  const rgb = hexToRgb(hex);
  if (!rgb) return DEFAULT_THEATER_GRADIENT;
  const { h, s } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  // Compress into a pastel band regardless of the swatch's own intensity —
  // vivid products read as gently colorful, near-neutral ones stay
  // close to the original warm-cream default rather than turning grey.
  const tint = Math.min(30, Math.max(12, s * 0.38));
  const c1 = hslToHex(h, tint * 0.5, 98);
  const c2 = hslToHex(h, tint, 92);
  const c3 = hslToHex(h, tint * 0.85, 85);
  return `radial-gradient(circle at 50% 30%, ${c1} 0%, ${c2} 45%, ${c3} 100%)`;
}
