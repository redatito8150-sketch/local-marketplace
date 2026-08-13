"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, ThumbsUp } from "lucide-react";

export default function ReviewActions({ reviewId, initialCount, initialHelpful, variant = "default" }: { reviewId: string; initialCount: number; initialHelpful: boolean; variant?: "default" | "brand" }) {
  const router = useRouter();
  const [helpful,setHelpful]=useState(initialHelpful); const [count,setCount]=useState(initialCount); const [busy,setBusy]=useState(false);
  async function toggle(){setBusy(true); const res=await fetch(`/api/reviews/${reviewId}/helpful`,{method:"POST"}); if(res.status===401){router.push("/account");return;} if(res.ok){const body=await res.json();setHelpful(body.helpful);setCount(body.count);} setBusy(false);}
  async function report(){const reason=window.prompt("Report reason: spam, offensive, personal_information, unrelated, suspected_fake, or other"); if(!reason)return; const res=await fetch(`/api/reviews/${reviewId}/report`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason})}); if(res.status===401){router.push("/account");return;} alert(res.ok?"Thank you. Our moderation team will review this report.":"This review could not be reported.");}
  return <div className={`flex items-center gap-2 ${variant === "brand" ? "justify-end" : "border-t border-[#eee5dc] pt-4"}`}>
    <button type="button" onClick={toggle} disabled={busy} aria-pressed={helpful} className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold transition ${helpful?"bg-[#fff2f2] text-[#C85956]":variant === "brand" ? "text-[#827871] hover:bg-[#f7f1eb]" : "border border-[#ddd2c8] text-[#665b54]"}`}><ThumbsUp className="h-3.5 w-3.5"/>Helpful ({count})</button>
    <button type="button" onClick={report} className={`inline-flex min-h-9 items-center gap-2 px-2 text-xs text-[#8d837c] ${variant === "brand" ? "opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100" : "ml-auto"}`}><Flag className="h-3.5 w-3.5"/>Report</button>
  </div>;
}
