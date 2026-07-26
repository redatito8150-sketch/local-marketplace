"use client";
import { useState } from "react";
import Image from "next/image";
import { Star } from "lucide-react";

const LABELS=["","Poor","Fair","Good","Very Good","Excellent"];
export default function ReviewForm({item}:{item:{id:string;product_id:string|null;name:string;image:string}}){
 const [rating,setRating]=useState(0);const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
 async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setMessage("");const form=new FormData(event.currentTarget);form.set("rating",String(rating));const res=await fetch("/api/reviews",{method:"POST",body:form});const body=await res.json();setMessage(res.ok?"Your verified review is now published.":body.error??"Could not publish review.");if(res.ok)event.currentTarget.reset();setBusy(false);}
 return <form onSubmit={submit} className="rounded-[24px] border border-[#e4d8ce] bg-white p-5 shadow-sm">
  <input type="hidden" name="productId" value={item.product_id??""}/><input type="hidden" name="orderItemId" value={item.id}/>
  <div className="flex items-center gap-3"><span className="relative h-14 w-14 overflow-hidden rounded-xl bg-[#f3ece5]"><Image src={item.image} alt="" fill sizes="56px" className="object-cover"/></span><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8f2335]">Verified purchase</p><h3 className="font-semibold text-[#332a26]">{item.name}</h3></div></div>
  <fieldset className="mt-5"><legend className="text-sm font-semibold">Your rating</legend><div className="mt-2 flex items-center gap-1">{[1,2,3,4,5].map(star=><button type="button" key={star} onClick={()=>setRating(star)} aria-label={`${star} stars — ${LABELS[star]}`} className="rounded p-1 focus:outline-none focus:ring-2 focus:ring-[#8f2335]"><Star className={`h-7 w-7 ${star<=rating?"fill-[#b47b24] text-[#b47b24]":"text-[#d8cec5]"}`}/></button>)}<span aria-live="polite" className="ml-2 text-xs text-[#766a62]">{LABELS[rating]}</span></div></fieldset>
  <label className="mt-4 block text-xs font-semibold">Title <span className="font-normal text-[#887b73]">(optional)</span><input name="title" maxLength={120} className="mt-1.5 min-h-11 w-full rounded-xl border border-[#ddd2c8] px-3 font-normal"/></label>
  <label className="mt-4 block text-xs font-semibold">Your review<textarea name="body" required minLength={10} maxLength={2000} rows={5} className="mt-1.5 w-full rounded-xl border border-[#ddd2c8] p-3 font-normal" placeholder="Tell other customers about the quality, fit, and experience."/></label>
  <label className="mt-4 block text-xs font-semibold">Photos <span className="font-normal text-[#887b73]">(up to 5 JPG, PNG, or WebP files)</span><input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple className="mt-2 block w-full text-xs"/></label>
  {message&&<p aria-live="polite" className="mt-4 text-sm text-[#8f2335]">{message}</p>}
  <button disabled={busy||!rating} className="mt-5 min-h-11 rounded-full bg-[#781c2d] px-6 text-sm font-bold text-white disabled:opacity-50">{busy?"Publishing…":"Publish review"}</button>
 </form>
}
