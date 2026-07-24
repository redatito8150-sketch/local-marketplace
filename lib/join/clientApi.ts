import type { BrandApplicationDocumentRecord, BrandApplicationRecord } from "@/types";
import type { DraftApplicationInput, SubmitApplicationInput } from "@/lib/join/validation";

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? "Something went wrong. Please try again.");
  }
  return data as T;
}

export async function fetchMyApplication(): Promise<{
  application: BrandApplicationRecord | null;
  cooldownActive: boolean;
}> {
  const res = await fetch("/api/join/application");
  return parseJsonOrThrow(res);
}

export async function saveDraft(
  input: DraftApplicationInput
): Promise<{ application: BrandApplicationRecord }> {
  const res = await fetch("/api/join/application", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(res);
}

export async function submitApplicationRequest(
  input: SubmitApplicationInput
): Promise<{ application: BrandApplicationRecord }> {
  const res = await fetch("/api/join/application/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(res);
}

export async function withdrawApplicationRequest(): Promise<{ application: BrandApplicationRecord }> {
  const res = await fetch("/api/join/application/withdraw", { method: "POST" });
  return parseJsonOrThrow(res);
}

export async function fetchMyDocuments(): Promise<{ documents: BrandApplicationDocumentRecord[] }> {
  const res = await fetch("/api/join/application/documents");
  return parseJsonOrThrow(res);
}

export async function uploadDocument(
  file: File
): Promise<{ document: BrandApplicationDocumentRecord }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/join/application/documents", { method: "POST", body: formData });
  return parseJsonOrThrow(res);
}
