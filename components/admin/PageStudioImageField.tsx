"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ImageIcon, Loader2, Upload } from "lucide-react";

type Asset = { path: string; url: string; name: string };

export default function PageStudioImageField({ pageKey, label, value, onChange }: { pageKey: string; label: string; value: string; onChange: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState("");

  const loadLibrary = async () => {
    setLibraryOpen(true); setError("");
    const response = await fetch(`/api/admin/page-studio/assets?pageKey=${encodeURIComponent(pageKey)}`);
    const data = await response.json();
    if (!response.ok) setError(data.error ?? "Could not load assets"); else setAssets(data.assets ?? []);
  };
  const upload = async (file: File) => {
    setUploading(true); setError("");
    const form = new FormData(); form.append("file", file); form.append("pageKey", pageKey);
    try {
      const response = await fetch("/api/admin/page-studio/assets", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Upload failed");
      onChange(data.url); setAssets((rows) => [{ path: data.path, url: data.url, name: file.name }, ...rows]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Upload failed"); }
    finally { setUploading(false); }
  };

  return <div><span className="block text-[11.5px] font-bold text-[var(--admin-text-muted)]">{label}</span>{value && <div className="relative mt-2 h-32 overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-muted)]"><Image src={value} alt="Selected section asset preview" fill sizes="360px" className="object-cover" /></div>}<input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Image URL" className="mt-2 w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2.5 text-[13px] outline-none focus:border-[var(--admin-primary)]/55" /><div className="mt-2 flex flex-wrap gap-2"><input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /><button type="button" disabled={uploading} onClick={() => input.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-[11.5px] font-bold">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload</button><button type="button" onClick={() => void loadLibrary()} className="inline-flex items-center gap-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-[11.5px] font-bold"><ImageIcon className="h-4 w-4" /> Asset library</button></div>{libraryOpen && <div className="mt-3 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] p-3"><div className="grid max-h-52 grid-cols-3 gap-2 overflow-y-auto">{assets.length ? assets.map((asset) => <button key={asset.path} type="button" onClick={() => { onChange(asset.url); setLibraryOpen(false); }} className="relative aspect-square overflow-hidden rounded-lg border border-[var(--admin-border)]"><Image src={asset.url} alt={asset.name} fill sizes="120px" className="object-cover" /></button>) : <p className="col-span-3 py-5 text-center text-[11.5px] text-[var(--admin-text-muted)]">No uploaded assets yet.</p>}</div></div>}{error && <p className="mt-2 text-[11.5px] font-semibold text-red-700">{error}</p>}</div>;
}
