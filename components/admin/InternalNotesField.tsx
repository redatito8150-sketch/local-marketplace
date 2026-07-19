"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InternalNotesField({
  orderId,
  initialValue,
}: {
  orderId: string;
  initialValue: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ internalNotes: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to save note");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        rows={4}
        placeholder="Notes only visible to admin/staff — never shown to the customer."
        className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-ink/30"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md border border-stone-150 bg-white px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-stone-50 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save note"}
        </button>
        {saved && <span className="text-[12px] text-ink-soft/50">Saved</span>}
      </div>
    </div>
  );
}
