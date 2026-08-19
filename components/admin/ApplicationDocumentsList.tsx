"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import type { BrandApplicationDocumentRecord } from "@/types";

// Documents remain in a private bucket and are downloaded through the
// authenticated admin API as opaque attachments, never opened as raw active
// content from a Storage URL.
export default function ApplicationDocumentsList({
  applicationId,
  documents,
}: {
  applicationId: string;
  documents: BrandApplicationDocumentRecord[];
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function download(docId: string, fileName: string) {
    setLoadingId(docId);
    setError("");
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}/documents/${docId}/signed-url`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to download document");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.rel = "noopener noreferrer";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } finally {
      setLoadingId(null);
    }
  }

  if (documents.length === 0) {
    return <p className="text-[13px] text-slate-500">No documents uploaded.</p>;
  }

  return (
    <div>
      <ul className="space-y-1.5">
        {documents.map((doc) => (
          <li
            key={doc.id}
            className="flex items-center justify-between gap-3 rounded-md border border-slate-150 bg-white px-3 py-2"
          >
            <span className="flex min-w-0 items-center gap-2 text-[13px] text-slate-700">
              <FileText className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.8} />
              <span className="truncate">{doc.fileName}</span>
            </span>
            <button
              type="button"
              onClick={() => download(doc.id, doc.fileName)}
              disabled={loadingId === doc.id}
              className="flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-mahalyred hover:underline disabled:opacity-60"
            >
              {loadingId === doc.id && <Loader2 className="h-3 w-3 animate-spin" />}
              Download
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-[12px] font-medium text-red-600">{error}</p>}
    </div>
  );
}
