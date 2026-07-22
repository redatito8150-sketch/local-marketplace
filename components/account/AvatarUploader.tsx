"use client";

import { useRef, useState } from "react";
import { Camera, LoaderCircle, Trash2 } from "lucide-react";
import AccountAvatar from "@/components/account/AccountAvatar";
import { accountSecondaryButton } from "@/components/account/AccountUI";

export default function AvatarUploader({
  name,
  initialUrl,
}: {
  name: string;
  initialUrl?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async (file?: File) => {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    const body = new FormData();
    body.append("avatar", file);
    try {
      const response = await fetch("/api/account/avatar", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not upload your photo.");
      setUrl(result.avatarUrl);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload your photo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/avatar", { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not remove your photo.");
      setUrl("");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove your photo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-[20px] border border-[var(--account-border)] bg-[var(--account-surface-muted)] p-5 sm:flex-row sm:items-center">
      <AccountAvatar name={name} imageUrl={url} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--account-text)]">Profile photo</p>
        <p className="mt-1 text-[12px] leading-5 text-[var(--account-text-muted)]">
          Upload a JPG, PNG, or WebP image up to 2 MB.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => upload(event.target.files?.[0])}
          />
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className={accountSecondaryButton}>
            {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
            {url ? "Change photo" : "Upload photo"}
          </button>
          {url && (
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="inline-flex min-h-11 items-center rounded-xl px-3 text-[13px] font-semibold text-[var(--account-danger)] hover:bg-[var(--account-surface)] disabled:opacity-60"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Remove
            </button>
          )}
        </div>
        {error && <p role="alert" className="mt-2 text-[12px] font-medium text-[var(--account-danger)]">{error}</p>}
      </div>
    </div>
  );
}
