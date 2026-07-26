"use client";
import { useState } from "react";
export default function ModerationActions({reviewId,current}:{reviewId:string;current:string}){
 const [message,setMessage]=useState("");async function update(status:string){const reason=window.prompt("Moderation reason or internal note (optional)")??undefined;const res=await fetch(`/api/admin/reviews/${reviewId}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,reason})});setMessage(res.ok?`Review is now ${status}.`:"Action failed.");}
 return <div className="mt-3 flex flex-wrap items-center gap-2"><span className="rounded-full bg-stone-100 px-3 py-1 text-xs">{current}</span>{["published","under_review","hidden","removed"].filter(s=>s!==current).map(s=><button key={s} onClick={()=>update(s)} className="rounded-full border px-3 py-1.5 text-xs capitalize">{s.replace("_"," ")}</button>)}{message&&<span className="text-xs">{message}</span>}</div>;
}
