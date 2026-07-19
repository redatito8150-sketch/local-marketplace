"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

export default function MarkNotificationReadButton({ id }: { id: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const markRead = async () => {
    setSubmitting(true);
    try {
      await fetch(`/api/admin/notifications/${id}`, { method: "PATCH" });
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={markRead}
      disabled={submitting}
      className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-ink-soft/60 transition-colors hover:bg-stone-100 hover:text-ink disabled:opacity-50"
    >
      <Check className="h-3.5 w-3.5" strokeWidth={2} />
      Mark read
    </button>
  );
}
