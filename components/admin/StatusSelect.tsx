"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StatusSelect({
  apiPath,
  value,
  options,
  bodyKey = "status",
  valueType = "string",
}: {
  apiPath: string;
  value: string;
  options: { value: string; label: string }[];
  bodyKey?: string;
  // A function prop here can't cross the server→client boundary (this is
  // rendered from Server Components like app/admin/users/page.tsx), so the
  // parsing rule is a plain serializable string instead of a callback.
  valueType?: "string" | "boolean";
}) {
  const parseValue = (v: string) => (valueType === "boolean" ? v === "true" : v);
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  const [saving, setSaving] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    const previous = current;
    setCurrent(newValue);
    setSaving(true);
    try {
      const res = await fetch(apiPath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [bodyKey]: parseValue(newValue) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to save change");
        setCurrent(previous);
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <select
      value={current}
      onChange={handleChange}
      disabled={saving}
      className="rounded-md border border-stone-150 bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-ink outline-none focus:border-ink/30 disabled:opacity-60"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
