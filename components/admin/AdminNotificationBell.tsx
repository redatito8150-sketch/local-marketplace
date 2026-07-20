"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import type { NotificationRecord } from "@/types";
import NotificationResolveActions from "@/components/admin/NotificationResolveActions";

export default function AdminNotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: NotificationRecord[];
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
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-soft/60 transition-colors hover:bg-stone-100 hover:text-ink"
      >
        <Bell className="h-4.5 w-4.5" strokeWidth={1.8} />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-2 w-2 rounded-full bg-red-500" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-md border border-stone-150 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-stone-150 px-4 py-3">
            <p className="text-[13px] font-semibold text-ink">Notifications</p>
            {unreadCount > 0 && (
              <span className="rounded-full bg-ink px-2 py-0.5 text-[10.5px] font-semibold text-cream">
                {unreadCount} unread
              </span>
            )}
          </div>
          <div className="max-h-72 overflow-auto">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`border-b border-stone-100 px-4 py-2.5 text-[12.5px] last:border-b-0 ${
                  n.read ? "text-ink-soft/60" : "text-ink"
                }`}
              >
                <p className="font-medium">{n.title}</p>
                {n.body && <p className="mt-0.5 text-[11.5px] text-ink-soft/50">{n.body}</p>}
                {n.resolution === "pending" && (
                  <div className="mt-2">
                    <NotificationResolveActions notificationId={n.id} />
                  </div>
                )}
              </div>
            ))}
            {notifications.length === 0 && (
              <p className="px-4 py-4 text-[12.5px] text-ink-soft/50">No notifications yet.</p>
            )}
          </div>
          <Link
            href="/admin/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-stone-150 px-4 py-2.5 text-center text-[12.5px] font-semibold text-ink hover:bg-stone-50"
          >
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
