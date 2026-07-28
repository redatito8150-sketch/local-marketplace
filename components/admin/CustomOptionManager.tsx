"use client";

import { useState } from "react";
import type { OptionTypeOption, OptionValueOption } from "./InventoryVariantsSection";

export default function CustomOptionManager({ optionTypes, optionValues, apiBasePath, brandId, brandSlug, onChanged }: {
  optionTypes: OptionTypeOption[];
  optionValues: OptionValueOption[];
  apiBasePath: "/api/admin" | "/api/brand-portal";
  brandId: string;
  brandSlug?: string;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const ownedTypes = optionTypes.filter((type) => !type.isSystem && type.brandId);
  const ownedValues = optionValues.filter((value) => value.brandId);
  const act = async (kind: "types" | "values", id: string, action: string, currentName: string) => {
    const name = action === "rename" ? window.prompt("New name", currentName) : undefined;
    if (action === "rename" && !name?.trim()) return;
    if (action === "delete" && !window.confirm(`Delete "${currentName}" permanently? Referenced historical data will be protected.`)) return;
    const brandQuery = apiBasePath === "/api/brand-portal" && brandSlug ? `?brand=${encodeURIComponent(brandSlug)}` : "";
    const response = await fetch(`${apiBasePath}/product-options/${kind}/${id}${brandQuery}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, name, ...(apiBasePath === "/api/admin" ? { brandId } : {}) }),
    });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? "Management action failed"); return; }
    setError(""); await onChanged();
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={!brandId} className="mt-2 text-[12px] font-semibold underline">Manage custom options, Sizes, and Colors</button>
      {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-label="Manage custom options">
        <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl3 bg-white p-6">
          <div className="flex justify-between"><h3 className="font-bold">Custom Option Manager</h3><button type="button" onClick={() => setOpen(false)}>Close</button></div>
          {error && <p className="mt-3 rounded bg-red-50 p-2 text-[12px] text-red-700">{error}</p>}
          <ManagerGroup title="Option Types" items={ownedTypes.map((type) => ({ id: type.id, name: type.name, archived: Boolean(type.isArchived) }))} onAct={(id, action, name) => act("types", id, action, name)} />
          <ManagerGroup title="Custom Values, Sizes, and Colors" items={ownedValues.map((value) => ({ id: value.id, name: value.label, archived: Boolean(value.isArchived) }))} onAct={(id, action, name) => act("values", id, action, name)} />
        </div>
      </div>}
    </>
  );
}

function ManagerGroup({ title, items, onAct }: { title: string; items: { id: string; name: string; archived: boolean }[]; onAct: (id: string, action: string, name: string) => void }) {
  return <section className="mt-5"><h4 className="text-[13px] font-semibold">{title}</h4><div className="mt-2 space-y-2">{items.length === 0 ? <p className="text-[12px] text-ink-soft/50">No brand-created items.</p> : items.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-2 rounded border p-2"><span className="mr-auto text-[12.5px]">{item.name}{item.archived ? " (Archived)" : ""}</span>{["rename", item.archived ? "restore" : "archive", "delete"].map((action) => <button key={action} type="button" onClick={() => onAct(item.id, action, item.name)} className="rounded border px-2 py-1 text-[11px] capitalize">{action}</button>)}</div>)}</div></section>;
}
