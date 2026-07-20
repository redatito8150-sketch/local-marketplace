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
    <div className="border-t border-stone-150 pt-8">
      <h2 className="text-[15px] font-semibold text-red-700">Delete Account</h2>
      <p className="mt-1.5 max-w-lg text-[13px] text-ink-soft/60">
        Permanently deletes your account, wishlist, addresses, and saved
        preferences. This cannot be undone.
      </p>
      {error && (
        <p className="mt-3 max-w-lg rounded-md bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={handleDelete}
        className="mt-4 rounded-md border border-red-200 px-5 py-2.5 text-[13px] font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Deleting…" : "Delete Account"}
      </button>
    </div>
  );
}
