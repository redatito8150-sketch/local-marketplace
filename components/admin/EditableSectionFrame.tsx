"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, EyeOff, Loader2, Pencil } from "lucide-react";

export default function EditableSectionFrame({ pageKey, sectionId, label, editorHref, sectionIds, index, canHide, config, visible, children }: { pageKey: string; sectionId: string; label: string; editorHref: string; sectionIds: string[]; index: number; canHide: boolean; config: Record<string, unknown>; visible: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const request = async (url: string, init: RequestInit) => {
    setBusy(true);
    try {
      const response = await fetch(url, init);
      if (!response.ok) throw new Error("Edit Mode action failed");
      router.refresh();
    } finally { setBusy(false); }
  };
  const move = (direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sectionIds.length) return;
    const next = [...sectionIds];
    [next[index], next[target]] = [next[target], next[index]];
    void request(`/api/admin/page-studio/${pageKey}/reorder`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectionIds: next }) });
  };
  const hide = () => void request(`/api/admin/page-studio/sections/${sectionId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config, visible: !visible }) });

  return <div className="group/edit relative outline outline-2 outline-offset-[-2px] outline-transparent transition hover:outline-mahalyred/70"><div className="pointer-events-none absolute left-3 top-3 z-[60] flex items-center gap-1 rounded-xl border border-red-200 bg-white/95 p-1.5 opacity-0 shadow-card backdrop-blur transition group-hover/edit:pointer-events-auto group-hover/edit:opacity-100 group-focus-within/edit:pointer-events-auto group-focus-within/edit:opacity-100"><span className="px-2 text-[10px] font-bold uppercase tracking-wide text-mahalyred">{label}</span><a href={editorHref} className="rounded-lg p-2 hover:bg-red-50" aria-label={`Edit ${label}`}><Pencil className="h-3.5 w-3.5" /></a><button type="button" disabled={busy || index === 0} onClick={() => move(-1)} className="rounded-lg p-2 hover:bg-red-50 disabled:opacity-30" aria-label={`Move ${label} up`}><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" disabled={busy || index === sectionIds.length - 1} onClick={() => move(1)} className="rounded-lg p-2 hover:bg-red-50 disabled:opacity-30" aria-label={`Move ${label} down`}><ArrowDown className="h-3.5 w-3.5" /></button>{canHide && <button type="button" disabled={busy} onClick={hide} className="rounded-lg p-2 hover:bg-red-50" aria-label={`Hide ${label}`}><EyeOff className="h-3.5 w-3.5" /></button>}{busy && <Loader2 className="mx-2 h-3.5 w-3.5 animate-spin text-mahalyred" />}</div>{children}</div>;
}
