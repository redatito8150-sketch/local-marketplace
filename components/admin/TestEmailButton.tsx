"use client";

import { useState } from "react";

export default function TestEmailButton() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const handleClick = async () => {
    setStatus("sending");
    try {
      const res = await fetch("/api/admin/test-email", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? "Failed to send test email");
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "sending"}
      className="rounded-md border border-stone-150 bg-white px-3.5 py-2 text-[12.5px] font-medium text-ink transition-colors hover:bg-stone-50 disabled:opacity-60"
    >
      {status === "sending"
        ? "Sending…"
        : status === "sent"
        ? "Test email sent ✓"
        : "Send test email"}
    </button>
  );
}
