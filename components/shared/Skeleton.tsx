import type { CSSProperties } from "react";

// Base loading-placeholder primitive. Every layout-matched skeleton in the
// app (product cards, tables, the product editor, dashboards, ...) should
// compose from this rather than hand-rolling its own `animate-pulse` div —
// keeps one shared color/animation so the whole site's loading states read
// as one system instead of several differently-styled ones.
//
// Reduced motion: app/globals.css already has a site-wide
// `@media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important } }`
// rule, so `animate-pulse` here is automatically neutralized for users who
// asked for it — no per-component opt-out needed.
export default function Skeleton({
  className = "",
  variant = "rect",
  tone = "light",
  style,
}: {
  className?: string;
  variant?: "rect" | "circle" | "text";
  // "light" (bg-stone-200/80) fits the site's usual cream/white surfaces.
  // "dark" (bg-white/10) is for the rare near-black surface (the auth
  // page's dark card) where a light-gray skeleton would look wrong.
  tone?: "light" | "dark";
  style?: CSSProperties;
}) {
  const shape = variant === "circle" ? "rounded-full" : variant === "text" ? "rounded" : "rounded-md";
  const toneClass = tone === "dark" ? "bg-white/10" : "bg-stone-200/80";
  return <div aria-hidden className={`animate-pulse ${toneClass} ${shape} ${className}`} style={style} />;
}

// Realistic multi-line text placeholder — the last line is shorter by
// default so it doesn't read as one suspicious uniform block of bars.
export function SkeletonText({
  lines = 1,
  className = "",
  lineClassName = "h-3",
  lastLineWidth = "70%",
  tone = "light",
}: {
  lines?: number;
  className?: string;
  lineClassName?: string;
  lastLineWidth?: string;
  tone?: "light" | "dark";
}) {
  return (
    <div aria-hidden className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          variant="text"
          tone={tone}
          className={lineClassName}
          style={{ width: index === lines - 1 ? lastLineWidth : "100%" }}
        />
      ))}
    </div>
  );
}

// Fixed-size circular placeholder — avatars, brand logos, color swatches.
export function SkeletonCircle({ size, className = "", tone = "light" }: { size: number; className?: string; tone?: "light" | "dark" }) {
  return <Skeleton variant="circle" tone={tone} className={className} style={{ width: size, height: size }} />;
}

// Button-shaped placeholder that reserves the real button's footprint so
// the layout doesn't jump when the real button (with its real label
// width) replaces it.
export function SkeletonButton({ className = "", width = "100%", tone = "light" }: { className?: string; width?: string | number; tone?: "light" | "dark" }) {
  return <Skeleton tone={tone} className={`h-11 ${className}`} style={{ width }} />;
}
