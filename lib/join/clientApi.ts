import type { BrandApplicationDocumentRecord, BrandApplicationRecord } from "@/types";
import type { DraftApplicationInput, SubmitApplicationInput } from "@/lib/join/validation";
import { parseApiError } from "@/lib/errors/client";
import { makeAppError } from "@/lib/errors/appError";

// Every function here throws a plain Error whose `.message` is ALWAYS a
// safe, normalized AppError.userMessage — never a raw server string
// (mostly fine already, since the API routes behind these calls return
// specific safe text) and never a raw browser-level failure (e.g. "Failed
// to fetch" when the network drops), which used to surface verbatim
// through ApplyBrandForm.tsx's `e instanceof Error ? e.message : fallback`
// catch blocks. Keeping the throw-based interface (rather than switching
// callers to a result type) means ApplyBrandForm's existing try/catch
// structure needed no changes to benefit from this.
async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(parseApiError(res.status, data).userMessage);
  }
  return data as T;
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new Error(makeAppError("network").userMessage);
  }
  return parseJsonOrThrow<T>(res);
}

export async function fetchMyApplication(): Promise<{
  application: BrandApplicationRecord | null;
  cooldownActive: boolean;
}> {
  return requestJson("/api/join/application");
}

export async function saveDraft(
  input: DraftApplicationInput
): Promise<{ application: BrandApplicationRecord }> {
  return requestJson("/api/join/application", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function submitApplicationRequest(
  input: SubmitApplicationInput
): Promise<{ application: BrandApplicationRecord }> {
  return requestJson("/api/join/application/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function withdrawApplicationRequest(): Promise<{ application: BrandApplicationRecord }> {
  return requestJson("/api/join/application/withdraw", { method: "POST" });
}

export async function fetchMyDocuments(): Promise<{ documents: BrandApplicationDocumentRecord[] }> {
  return requestJson("/api/join/application/documents");
}

export async function uploadDocument(
  file: File
): Promise<{ document: BrandApplicationDocumentRecord }> {
  const formData = new FormData();
  formData.append("file", file);
  return requestJson("/api/join/application/documents", { method: "POST", body: formData });
}
