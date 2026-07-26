import assert from "node:assert/strict";
import test from "node:test";
import { darkColors, lightColors } from "../src/theme/tokens.ts";

function luminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)!.map((value) => {
    const channel = Number.parseInt(value, 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrast(a: string, b: string) {
  const [bright, dark] = [luminance(a), luminance(b)].sort((left, right) => right - left);
  return (bright! + 0.05) / (dark! + 0.05);
}

test("primary text meets WCAG AA contrast in both themes", () => {
  assert.ok(contrast(lightColors.text, lightColors.background) >= 4.5);
  assert.ok(contrast(darkColors.text, darkColors.background) >= 4.5);
  assert.ok(contrast(lightColors.onPrimary, lightColors.primary) >= 4.5);
  assert.ok(contrast(darkColors.onPrimary, darkColors.primary) >= 4.5);
});
