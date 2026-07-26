"use client";

import { useState } from "react";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export default function AccountAvatar({
  name,
  imageUrl,
  size = "large",
}: {
  name: string;
  imageUrl?: string | null;
  size?: "small" | "large";
}) {
  const sizeClass = size === "large" ? "h-20 w-20 text-xl" : "h-12 w-12 text-sm";
  // Resets whenever the source URL itself changes (e.g. a manual upload
  // replacing a provider fallback) so a fresh URL always gets a fresh
  // chance to load instead of staying stuck on a prior failure. Adjusting
  // state during render (rather than in an effect) is the pattern React
  // itself recommends for "reset state when a prop changes".
  const [broken, setBroken] = useState(false);
  const [lastImageUrl, setLastImageUrl] = useState(imageUrl);
  if (imageUrl !== lastImageUrl) {
    setLastImageUrl(imageUrl);
    setBroken(false);
  }
  const showImage = Boolean(imageUrl) && !broken;

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-[var(--account-surface)] bg-[var(--account-accent-soft)] font-semibold text-[var(--account-accent)] shadow-sm ${sizeClass}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl!}
          alt={`${name || "Account"} avatar`}
          className="h-full w-full object-cover"
          // Fires at most once per URL — setting `broken` swaps the <img>
          // out of the tree entirely, so there's no element left to keep
          // re-firing onError (no infinite loop) for an expired/invalid
          // provider photo or a CSP-blocked host.
          onError={() => setBroken(true)}
        />
      ) : (
        <span aria-hidden="true">{initialsFromName(name)}</span>
      )}
    </div>
  );
}
