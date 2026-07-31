"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import type { UserNotificationRecord } from "@/types";

export default function AccountNotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: UserNotificationRecord[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--account-border)] bg-[var(--account-surface)] text-[var(--account-text-muted)] transition-colors hover:text-[var(--account-text)]"
      >
        <Bell className="h-4 w-4" strokeWidth={1.8} />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-2 w-2 rounded-full bg-red-500" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-[min(88vw,340px)] rounded-xl border border-[var(--account-border)] bg-[var(--account-surface)] shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--account-border)] px-4 py-3">
            <p className="text-[13px] font-semibold text-[var(--account-text)]">Notifications</p>
            {unreadCount > 0 && (
              <span className="rounded-full bg-[var(--account-accent)] px-2 py-0.5 text-[10.5px] font-semibold text-white">
                {unreadCount} unread
              </span>
            )}
          </div>
          <div className="max-h-72 overflow-auto">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`border-b border-[var(--account-border)] px-4 py-2.5 text-[12.5px] last:border-b-0 ${
                  n.read ? "text-[var(--account-text-muted)]" : "text-[var(--account-text)]"
                }`}
              >
                <p className="font-medium">{n.title}</p>
                {n.body && <p className="mt-0.5 text-[11.5px] text-[var(--account-text-muted)]">{n.body}</p>}
              </div>
            ))}
            {notifications.length === 0 && (
              <p className="px-4 py-4 text-[12.5px] text-[var(--account-text-muted)]">No notifications yet.</p>
            )}
          </div>
          <Link
            href="/account/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-[var(--account-border)] px-4 py-2.5 text-center text-[12.5px] font-semibold text-[var(--account-text)] hover:bg-[var(--account-surface-muted)]"
          >
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
