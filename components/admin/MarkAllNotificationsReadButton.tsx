"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MarkAllNotificationsReadButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const markAllRead = async () => {
    setSubmitting(true);
    try {
      await fetch("/api/admin/notifications", { method: "PATCH" });
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={markAllRead}
      disabled={submitting}
      className="rounded-md border border-stone-150 px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-stone-50 disabled:opacity-50"
    >
      {submitting ? "Marking…" : "Mark all as read"}
    </button>
  );
}
