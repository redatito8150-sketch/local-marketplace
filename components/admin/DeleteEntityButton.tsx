"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export default function DeleteEntityButton({
  apiPath,
  name,
}: {
  apiPath: string;
  name: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(apiPath, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to delete");
        return;
      }
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      aria-label={`Delete ${name}`}
      className="rounded-md p-1.5 text-ink-soft/60 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" strokeWidth={1.6} />
    </button>
  );
}
