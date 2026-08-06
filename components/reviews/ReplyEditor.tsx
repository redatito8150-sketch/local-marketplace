"use client";
import { useState } from "react";

// brandSlug threads the brand-portal's own `?brand=` context through to
// the API — without it, the API route falls back to resolving whichever
// brand comes first for the signed-in account, which silently picks the
// wrong brand (and fails RLS) for anyone managing more than one brand, or
// an admin viewing a brand's portal via `?brand=slug`. That mismatch is
// exactly what used to surface as a flat, undiagnosable "Could not save
// response." with no real cause visible anywhere.
export default function ReplyEditor({ reviewId, initial = "", brandSlug }: { reviewId: string; initial?: string; brandSlug?: string }) {
  const [body, setBody] = useState(initial), [message, setMessage] = useState("");
  const brandQuery = brandSlug ? `?brand=${encodeURIComponent(brandSlug)}` : "";
  async function save() {
    const res = await fetch(`/api/brand-portal/reviews/${reviewId}/reply${brandQuery}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok ? "Official response saved." : (data.error ?? "Could not save response."));
  }
  async function remove() {
    if (!confirm("Delete this brand response?")) return;
    const res = await fetch(`/api/brand-portal/reviews/${reviewId}/reply${brandQuery}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setBody(""); setMessage("Response deleted."); } else { setMessage(data.error ?? "Could not delete response."); }
  }
  return <div className="mt-4 rounded-xl bg-[#f7f1eb] p-3"><label className="text-xs font-semibold">Official brand response<textarea value={body} onChange={e=>setBody(e.target.value)} maxLength={1500} rows={3} className="mt-2 w-full rounded-lg border border-[#ddd2c8] p-3 font-normal"/></label><div className="mt-2 flex gap-2"><button onClick={save} className="rounded-full bg-[#3b332d] px-4 py-2 text-xs font-bold text-white">Save reply</button>{initial&&<button onClick={remove} className="px-3 text-xs text-red-700">Delete</button>}</div>{message&&<p className="mt-2 text-xs">{message}</p>}</div>;
}
