import type { OptionSwatchType } from "@/types";

// Single/Two-Colors/Multicolor rendering, shared by the admin option
// picker, the variant management table's color groups, and (structurally
// identical props) reusable by the storefront color selector.
export default function ColorSwatch({
  swatchType,
  primaryColor,
  secondaryColor,
  size = 20,
}: {
  swatchType?: OptionSwatchType;
  primaryColor?: string;
  secondaryColor?: string;
  size?: number;
}) {
  const style = { width: size, height: size };

  if (swatchType === "split" && primaryColor && secondaryColor) {
    return (
      <span
        aria-hidden="true"
        className="inline-block shrink-0 overflow-hidden rounded-full border border-black/10"
        style={{
          ...style,
          background: `linear-gradient(135deg, ${primaryColor} 50%, ${secondaryColor} 50%)`,
        }}
      />
    );
  }

  if (swatchType === "multicolor") {
    return (
      <span
        aria-hidden="true"
        className="inline-block shrink-0 rounded-full border border-black/10"
        style={{
          ...style,
          background:
            "conic-gradient(from 90deg, #C1272D, #F0C929, #2E5339, #2C5AA0, #E8A0BF, #C1272D)",
        }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full border border-black/10"
      style={{ ...style, backgroundColor: primaryColor || "#D9D2C8" }}
    />
  );
}
