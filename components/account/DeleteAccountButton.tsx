"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function DeleteAccountButton() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    if (
      !window.confirm(
        "Delete your account? This cannot be undone. Your past orders will be kept for our records but no longer linked to you."
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setBusy(false);
        return;
      }
      await signOut();
      router.push("/");
    } catch {
      setError("Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="max-w-lg text-[13px] text-[var(--account-text-muted)]">
        Permanently deletes your account, wishlist, addresses, and saved
        preferences. This cannot be undone.
      </p>
      {error && (
        <p role="alert" className="mt-3 max-w-lg rounded-xl bg-[color-mix(in_srgb,var(--account-danger)_12%,transparent)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--account-danger)]">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={handleDelete}
        className="mt-4 rounded-xl border border-[var(--account-danger)]/30 px-5 py-2.5 text-[13px] font-semibold text-[var(--account-danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--account-danger)_10%,transparent)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Deleting…" : "Delete Account"}
      </button>
    </div>
  );
}
