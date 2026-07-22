"use client";

import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { getDeviceId } from "@/lib/deviceId";
import { accountSecondaryButton } from "@/components/account/AccountUI";

interface SessionRow {
  id: string;
  device_id: string;
  user_agent: string | null;
  last_seen_at: string;
}

export default function SessionsList() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const currentDeviceId = getDeviceId();

  const load = () => {
    fetch("/api/account/sessions")
      .then((res) => (res.ok ? res.json() : { sessions: [] }))
      .then((data: { sessions: SessionRow[] }) => setSessions(data.sessions ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const revoke = async (id: string) => {
    setBusy(true);
    await fetch(`/api/account/sessions/${id}`, { method: "DELETE" });
    load();
    setBusy(false);
  };

  const signOutOthers = async () => {
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signOut({ scope: "others" });
    setBusy(false);
    if (!error) {
      setMessage("Signed out of every other device.");
      load();
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-4">
      {message && (
        <p role="status" className="rounded-xl bg-[color-mix(in_srgb,var(--account-success)_12%,transparent)] px-4 py-3 text-[13px] font-medium text-[var(--account-success)]">
          {message}
        </p>
      )}

      {sessions.length === 0 ? (
        <p className="text-[13px] text-[var(--account-text-muted)]">No devices on record yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {sessions.map((session) => {
            const isCurrent = session.device_id === currentDeviceId;
            return (
              <li
                key={session.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--account-border)] bg-[var(--account-surface)] px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Monitor className="h-4 w-4 shrink-0 text-[var(--account-text-muted)]" strokeWidth={1.7} />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-[var(--account-text)]">
                      {session.user_agent ?? "Unknown device"}
                      {isCurrent && (
                        <span className="ml-2 text-[11px] font-semibold text-[var(--account-accent)]">
                          This device
                        </span>
                      )}
                    </p>
                    <p className="text-[11.5px] text-[var(--account-text-muted)]">
                      Last active {new Date(session.last_seen_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                {!isCurrent && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => revoke(session.id)}
                    className="shrink-0 text-[12.5px] font-semibold text-[var(--account-danger)] hover:underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <button type="button" disabled={busy} onClick={signOutOthers} className={accountSecondaryButton}>
        Sign out of all other devices
      </button>
    </div>
  );
}
