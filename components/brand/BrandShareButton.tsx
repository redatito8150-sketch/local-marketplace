"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";

export default function BrandShareButton({ brandName }: { brandName: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    if (navigator.share) return navigator.share({ title: `${brandName} on Mahaly`, url: window.location.href });
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return <button type="button" onClick={share} aria-label={`Share ${brandName}`} className="inline-flex h-11 items-center gap-2 rounded-full border border-white/35 bg-white/90 px-4 text-[12px] font-semibold text-[#342d28] backdrop-blur transition hover:bg-white">{copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}<span className="hidden sm:inline">{copied ? "Copied" : "Share"}</span></button>;
}
