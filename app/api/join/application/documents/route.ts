import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { checkRateLimit } from "@/lib/rateLimit";
import { notify } from "@/lib/notify";
import {
  prepareSafeApplicationDocument,
  safeDocumentDisplayName,
} from "@/lib/uploads/applicationDocument";
import { readFormData } from "@/lib/uploads/formData";
import {
  getApplicationDocuments,
  getMyApplication,
  toDocumentRecord,
} from "@/lib/join/applicationService";
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  DOCUMENTS_BUCKET,
  MAX_ACTIVE_APPLICATION_DOCUMENTS,
  MAX_DOCUMENT_SIZE_BYTES,
} from "@/lib/join/constants";
import type { ApplicationDocumentType } from "@/types";

const DOCUMENT_TYPES: ApplicationDocumentType[] = [
  "commercial_registration",
  "tax_card",
  "trademark_certificate",
  "authorized_representative",
  "other_supporting_document",
];

// Own uploaded documents for the applicant's current application.
export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const application = await getMyApplication(user.id);
  if (!application) {
    return NextResponse.json({ documents: [] });
  }

  try {
    const documents = await getApplicationDocuments(application.id);
    return NextResponse.json({ documents });
  } catch (error) {
    return safeErrorResponse("join.application.documents.get", error as Error);
  }
}

// Uploads a legal/business document (registration, tax card, etc.) for the
// applicant's own draft/changes_requested application. Storage path is
// always {userId}/{applicationId}/{fileName} — matches the private bucket's
// RLS policy exactly, never a client-supplied path.
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  if (!checkRateLimit(`join-application-document-upload:${user.id}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many uploads — please slow down" }, { status: 429 });
  }

  const application = await getMyApplication(user.id);
  if (!application) {
    return NextResponse.json({ error: "No application found" }, { status: 404 });
  }
  if (application.status !== "draft" && application.status !== "changes_requested") {
    return NextResponse.json(
      { error: `Documents cannot be uploaded while the application is "${application.status}"` },
      { status: 409 }
    );
  }

  const formData = await readFormData(request);
  const file = formData.get("file");
  const documentType = String(formData.get("documentType") ?? "other_supporting_document");
  const replaceDocumentId = String(formData.get("replaceDocumentId") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!DOCUMENT_TYPES.includes(documentType as ApplicationDocumentType)) {
    return NextResponse.json({ error: "Invalid document category" }, { status: 400 });
  }
  if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported document type" }, { status: 400 });
  }

  let replacingExisting = false;
  if (replaceDocumentId) {
    const { data: replacement, error: replacementError } = await supabaseAdmin
      .from("brand_application_documents")
      .select("id")
      .eq("id", replaceDocumentId)
      .eq("application_id", application.id)
      .eq("upload_status", "uploaded")
      .is("removed_at", null)
      .maybeSingle();
    if (replacementError) return safeErrorResponse("join.application.documents.replace.lookup", replacementError);
    if (!replacement) return NextResponse.json({ error: "Document to replace was not found" }, { status: 404 });
    replacingExisting = true;
  }

  const { count: activeDocumentCount, error: countError } = await supabaseAdmin
    .from("brand_application_documents")
    .select("id", { count: "exact", head: true })
    .eq("application_id", application.id)
    .eq("upload_status", "uploaded")
    .is("removed_at", null);
  if (countError) return safeErrorResponse("join.application.documents.count", countError);
  if (!replacingExisting && (activeDocumentCount ?? 0) >= MAX_ACTIVE_APPLICATION_DOCUMENTS) {
    return NextResponse.json(
      { error: `Up to ${MAX_ACTIVE_APPLICATION_DOCUMENTS} active documents are allowed per application` },
      { status: 409 }
    );
  }

  const prepared = await prepareSafeApplicationDocument(file, MAX_DOCUMENT_SIZE_BYTES);
  if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: 400 });

  const fileName = `${randomUUID()}.${prepared.upload.extension}`;
  const path = `${user.id}/${application.id}/${fileName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, prepared.upload.bytes, { contentType: prepared.upload.mimeType, upsert: false });

  if (uploadError) {
    await notify("storage_error", "Application document upload failed", uploadError.message);
    return safeErrorResponse("join.application.documents.upload", uploadError, "Upload failed");
  }

  const { data, error } = await supabaseAdmin
    .from("brand_application_documents")
    .insert({
      application_id: application.id,
      uploaded_by: user.id,
      file_name: safeDocumentDisplayName(file.name, prepared.upload.extension),
      storage_path: path,
      mime_type: prepared.upload.mimeType,
      file_size_bytes: prepared.upload.bytes.byteLength,
      document_type: documentType,
      upload_status: "uploaded",
    })
    .select("*")
    .single();

  if (error) {
    await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).remove([path]);
    return safeErrorResponse("join.application.documents.post", error);
  }

  if (replacingExisting) {
    await supabaseAdmin
      .from("brand_application_documents")
      .update({ upload_status: "replaced", replaced_by: data.id })
      .eq("id", replaceDocumentId)
      .eq("application_id", application.id)
      .is("removed_at", null);
  }

  return NextResponse.json({ document: toDocumentRecord(data) });
}

export async function DELETE(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const documentId = request.nextUrl.searchParams.get("documentId");
  if (!documentId) return NextResponse.json({ error: "Document id is required" }, { status: 400 });

  const application = await getMyApplication(user.id);
  if (!application) return NextResponse.json({ error: "No application found" }, { status: 404 });
  if (!["draft", "changes_requested"].includes(application.status)) {
    return NextResponse.json({ error: "Documents are locked while this application is under review" }, { status: 409 });
  }

  const { data: document, error } = await supabaseAdmin
    .from("brand_application_documents")
    .select("id, storage_path")
    .eq("id", documentId)
    .eq("application_id", application.id)
    .is("removed_at", null)
    .maybeSingle();
  if (error) return safeErrorResponse("join.application.documents.delete.lookup", error);
  if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { error: storageError } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .remove([document.storage_path]);
  if (storageError) return safeErrorResponse("join.application.documents.delete.storage", storageError);

  const { error: updateError } = await supabaseAdmin
    .from("brand_application_documents")
    .update({ upload_status: "removed", removed_at: new Date().toISOString() })
    .eq("id", document.id);
  if (updateError) return safeErrorResponse("join.application.documents.delete.record", updateError);

  return NextResponse.json({ ok: true });
}
