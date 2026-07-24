"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import type { BrandApplicationDocumentRecord } from "@/types";

// Every "view" click issues a fresh short-lived signed URL — the bucket is
// private, so there is no persistent link to leak or cache.
export default function ApplicationDocumentsList({
  applicationId,
  documents,
}: {
  applicationId: string;
  documents: BrandApplicationDocumentRecord[];
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function view(docId: string) {
    setLoadingId(docId);
    setError("");
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}/documents/${docId}/signed-url`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error ?? "Failed to open document");
        return;
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
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
              onClick={() => view(doc.id)}
              disabled={loadingId === doc.id}
              className="flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-mahalyred hover:underline disabled:opacity-60"
            >
              {loadingId === doc.id && <Loader2 className="h-3 w-3 animate-spin" />}
              View
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-[12px] font-medium text-red-600">{error}</p>}
    </div>
  );
}
