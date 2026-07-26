"use client";
import { useState } from "react";
export default function ReplyEditor({reviewId,initial=""}:{reviewId:string;initial?:string}){
 const [body,setBody]=useState(initial),[message,setMessage]=useState("");
 async function save(){const res=await fetch(`/api/brand-portal/reviews/${reviewId}/reply`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({body})});setMessage(res.ok?"Official response saved.":"Could not save response.");}
 async function remove(){if(!confirm("Delete this brand response?"))return;const res=await fetch(`/api/brand-portal/reviews/${reviewId}/reply`,{method:"DELETE"});if(res.ok){setBody("");setMessage("Response deleted.");}}
 return <div className="mt-4 rounded-xl bg-[#f7f1eb] p-3"><label className="text-xs font-semibold">Official brand response<textarea value={body} onChange={e=>setBody(e.target.value)} maxLength={1500} rows={3} className="mt-2 w-full rounded-lg border border-[#ddd2c8] p-3 font-normal"/></label><div className="mt-2 flex gap-2"><button onClick={save} className="rounded-full bg-[#3b332d] px-4 py-2 text-xs font-bold text-white">Save reply</button>{initial&&<button onClick={remove} className="px-3 text-xs text-red-700">Delete</button>}</div>{message&&<p className="mt-2 text-xs">{message}</p>}</div>;
}
