"use client";

import { AlertTriangle } from "lucide-react";

// Top-of-form summary for multi-section forms with several invalid fields
// at once (the Brand Application form and Product Editor both need this —
// previously each built its own one-off issue list). Each entry can jump
// to its field via an anchor id supplied by the caller.
export default function FormErrorSummary({
  title = "Please fix the following before continuing:",
  fieldErrors,
  onFocusField,
}: {
  title?: string;
  fieldErrors: Record<string, string>;
  onFocusField?: (fieldKey: string) => void;
}) {
  const entries = Object.entries(fieldErrors);
  if (entries.length === 0) return null;

  return (
    <div role="alert" aria-live="assertive" className="rounded-md border border-red-200 bg-red-50 p-4">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-red-700">
        <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        {title}
      </div>
      <ul className="mt-2 space-y-1 pl-6 text-[13px] text-red-700">
        {entries.map(([field, message]) => (
          <li key={field} className="list-disc">
            {onFocusField ? (
              <button type="button" onClick={() => onFocusField(field)} className="text-left underline decoration-red-300 underline-offset-2 hover:decoration-red-500">
                {message}
              </button>
            ) : (
              message
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
