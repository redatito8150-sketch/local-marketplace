"use client";
import { useState } from "react";
import { Flag, ThumbsUp } from "lucide-react";

export default function ReviewActions({ reviewId, initialCount, initialHelpful }: { reviewId: string; initialCount: number; initialHelpful: boolean }) {
  const [helpful,setHelpful]=useState(initialHelpful); const [count,setCount]=useState(initialCount); const [busy,setBusy]=useState(false);
  async function toggle(){setBusy(true); const res=await fetch(`/api/reviews/${reviewId}/helpful`,{method:"POST"}); if(res.status===401){location.href="/account";return;} if(res.ok){const body=await res.json();setHelpful(body.helpful);setCount(body.count);} setBusy(false);}
  async function report(){const reason=window.prompt("Report reason: spam, offensive, personal_information, unrelated, suspected_fake, or other"); if(!reason)return; const res=await fetch(`/api/reviews/${reviewId}/report`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason})}); if(res.status===401){location.href="/account";return;} alert(res.ok?"Thank you. Our moderation team will review this report.":"This review could not be reported.");}
  return <div className="flex items-center gap-2 border-t border-[#eee5dc] pt-4">
    <button type="button" onClick={toggle} disabled={busy} aria-pressed={helpful} className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-xs font-semibold ${helpful?"border-[#8f2335] bg-[#fff2f2] text-[#8f2335]":"border-[#ddd2c8] text-[#665b54]"}`}><ThumbsUp className="h-3.5 w-3.5"/>Helpful ({count})</button>
    <button type="button" onClick={report} className="ml-auto inline-flex min-h-10 items-center gap-2 px-2 text-xs text-[#80746c]"><Flag className="h-3.5 w-3.5"/>Report</button>
  </div>;
}
