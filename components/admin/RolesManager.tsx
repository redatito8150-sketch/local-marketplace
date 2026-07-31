"use client";

import { useMemo, useState } from "react";
import { Lock, Plus, Shield, Trash2, UserMinus, UserPlus, X } from "lucide-react";
import type { PermissionRecord, RoleRecord, RoleMemberRecord } from "@/types";
import { dashboardButtonPrimary, dashboardButtonSecondary } from "@/components/dashboard/DashboardUI";

const DEFAULT_COLOR = "#64748B";

function Toggle({ on, disabled, onClick }: { on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${on ? "bg-mahalyred" : "bg-slate-200"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}

function RoleColorDot({ color }: { color: string | null }) {
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color ?? DEFAULT_COLOR }} />;
}

export default function RolesManager({
  initialRoles,
  allPermissions,
}: {
  initialRoles: RoleRecord[];
  allPermissions: PermissionRecord[];
}) {
  const [roles, setRoles] = useState(initialRoles);
  const [selectedId, setSelectedId] = useState<string | null>(initialRoles[0]?.id ?? null);
  const [tab, setTab] = useState<"permissions" | "members">("permissions");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [members, setMembers] = useState<RoleMemberRecord[] | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [addEmail, setAddEmail] = useState("");

  const selected = useMemo(() => roles.find((r) => r.id === selectedId) ?? null, [roles, selectedId]);

  const permissionsByCategory = useMemo(() => {
    const map = new Map<string, PermissionRecord[]>();
    for (const perm of allPermissions) {
      const list = map.get(perm.category) ?? [];
      list.push(perm);
      map.set(perm.category, list);
    }
    return [...map.entries()];
  }, [allPermissions]);

  async function refreshRoles() {
    const res = await fetch("/api/admin/roles");
    const data = await res.json().catch(() => null);
    if (res.ok && data?.roles) setRoles(data.roles as RoleRecord[]);
  }

  async function loadMembers(roleId: string) {
    setMembersLoading(true);
    setMembers(null);
    try {
      const res = await fetch(`/api/admin/roles/${roleId}/members`);
      const data = await res.json().catch(() => null);
      if (res.ok) setMembers((data?.members ?? []) as RoleMemberRecord[]);
    } finally {
      setMembersLoading(false);
    }
  }

  function selectRole(id: string) {
    setSelectedId(id);
    setTab("permissions");
    setMembers(null);
    setError("");
  }

  async function createRole() {
    if (!newName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Failed to create role");
        return;
      }
      setNewName("");
      setCreating(false);
      await refreshRoles();
      setSelectedId(data.id);
    } finally {
      setBusy(false);
    }
  }

  async function togglePermission(role: RoleRecord, key: string) {
    if (role.isProtected || busy) return;
    const nextKeys = role.permissionKeys.includes(key)
      ? role.permissionKeys.filter((k) => k !== key)
      : [...role.permissionKeys, key];

    // Optimistic update so the switch feels instant, same as Discord.
    setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, permissionKeys: nextKeys } : r)));
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/roles/${role.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionKeys: nextKeys }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to update permission");
        await refreshRoles();
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteRole(role: RoleRecord) {
    if (role.isProtected) return;
    if (!confirm(`Delete the "${role.name}" role? Everyone holding it will lose its permissions immediately.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/roles/${role.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Failed to delete role");
        return;
      }
      const remaining = roles.filter((r) => r.id !== role.id);
      setRoles(remaining);
      setSelectedId(remaining[0]?.id ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function assignMember() {
    if (!selected || !addEmail.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/roles/${selected.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Failed to assign role");
        return;
      }
      setAddEmail("");
      await Promise.all([loadMembers(selected.id), refreshRoles()]);
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: string) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/roles/${selected.id}/members?userId=${userId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Failed to remove member");
        return;
      }
      await Promise.all([loadMembers(selected.id), refreshRoles()]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
      {/* Role list */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
          <h2 className="text-[13px] font-bold text-slate-900">Roles ({roles.length})</h2>
          <button
            type="button"
            onClick={() => setCreating((c) => !c)}
            aria-label="New role"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            {creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </button>
        </div>
        {creating && (
          <div className="space-y-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Role name"
              maxLength={50}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12.5px] outline-none focus:border-slate-400"
            />
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
              />
              <button type="button" disabled={busy || !newName.trim()} onClick={createRole} className={`${dashboardButtonPrimary} h-8 flex-1 text-[12px]`}>
                Create
              </button>
            </div>
          </div>
        )}
        <ul className="max-h-[560px] overflow-y-auto p-2">
          {roles.map((role) => (
            <li key={role.id}>
              <button
                type="button"
                onClick={() => selectRole(role.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[12.5px] font-semibold transition-colors ${
                  selected?.id === role.id ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <RoleColorDot color={role.color} />
                <span className="min-w-0 flex-1 truncate">{role.name}</span>
                {role.isProtected && <Lock className={`h-3 w-3 shrink-0 ${selected?.id === role.id ? "text-white/60" : "text-slate-400"}`} />}
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${selected?.id === role.id ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>
                  {role.memberCount}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Role detail */}
      {selected ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <RoleColorDot color={selected.color} />
              <div>
                <h2 className="flex items-center gap-1.5 text-[15px] font-bold text-slate-900">
                  {selected.name}
                  {selected.isProtected && <Lock className="h-3.5 w-3.5 text-slate-400" />}
                </h2>
                <p className="mt-0.5 text-[12px] text-slate-500">{selected.description || "No description"}</p>
              </div>
            </div>
            {!selected.isProtected && (
              <button
                type="button"
                onClick={() => deleteRole(selected)}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11.5px] font-semibold text-red-700 transition-colors hover:bg-red-100"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete role
              </button>
            )}
          </div>

          {selected.isProtected && (
            <p className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-5 py-2.5 text-[11.5px] font-medium text-amber-800">
              <Shield className="h-3.5 w-3.5 shrink-0" /> Built-in role — permissions are locked so the system always behaves as expected. You can still rename it or manage members.
            </p>
          )}

          {error && <p className="border-b border-red-100 bg-red-50 px-5 py-2 text-[12px] text-red-700">{error}</p>}

          <div className="flex gap-1 border-b border-slate-100 px-5 pt-3">
            {(["permissions", "members"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  if (t === "members" && members === null) loadMembers(selected.id);
                }}
                className={`rounded-t-lg px-3 py-2 text-[12.5px] font-semibold capitalize transition-colors ${
                  tab === t ? "border-b-2 border-mahalyred text-mahalyred" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {t === "members" ? `Members (${selected.memberCount})` : "Permissions"}
              </button>
            ))}
          </div>

          {tab === "permissions" ? (
            <div className="max-h-[520px] overflow-y-auto px-5 py-4">
              {permissionsByCategory.map(([category, perms]) => (
                <div key={category} className="mb-5 last:mb-0">
                  <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-400">{category}</p>
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                    {perms.map((perm) => (
                      <div key={perm.key} className="flex items-center justify-between gap-4 px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-semibold text-slate-900">{perm.label}</p>
                          <p className="mt-0.5 text-[11.5px] leading-5 text-slate-500">{perm.description}</p>
                        </div>
                        <Toggle
                          on={selected.permissionKeys.includes(perm.key)}
                          disabled={selected.isProtected || busy}
                          onClick={() => togglePermission(selected, perm.key)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-4">
              <div className="mb-4 flex items-center gap-2">
                <input
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && assignMember()}
                  placeholder="Account email to add"
                  className="flex-1 rounded-lg border border-slate-200 px-2.5 py-2 text-[12.5px] outline-none focus:border-slate-400"
                />
                <button type="button" disabled={busy || !addEmail.trim()} onClick={assignMember} className={`${dashboardButtonSecondary} h-9 gap-1.5 text-[12px]`}>
                  <UserPlus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
              {membersLoading ? (
                <p className="py-8 text-center text-[12.5px] text-slate-400">Loading members…</p>
              ) : members && members.length > 0 ? (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                  {members.map((member) => (
                    <li key={member.userId} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-semibold text-slate-900">{member.fullName || "Unnamed user"}</p>
                        <p className="truncate text-[11.5px] text-slate-500">{member.email}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeMember(member.userId)}
                        aria-label={`Remove ${member.email ?? "member"}`}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                      >
                        <UserMinus className="h-3.5 w-3.5" /> Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-8 text-center text-[12.5px] text-slate-400">Nobody holds this role yet.</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-[13px] text-slate-400">
          Create a role to get started.
        </div>
      )}
    </div>
  );
}
