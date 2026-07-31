import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { checkRateLimit } from "@/lib/rateLimit";
import { notify } from "@/lib/notify";
import { hasExpectedDocumentSignature } from "@/lib/uploads/imageValidation";
import { readFormData } from "@/lib/uploads/formData";
import {
  getApplicationDocuments,
  getMyApplication,
  toDocumentRecord,
} from "@/lib/join/applicationService";
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  DOCUMENTS_BUCKET,
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

function sanitizeFileName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(-80) || "document"
  );
}

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
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return NextResponse.json({ error: "File is larger than 10MB" }, { status: 400 });
  }
  if (!(await hasExpectedDocumentSignature(file))) {
    return NextResponse.json({ error: "The file content does not match its type" }, { status: 400 });
  }

  const fileName = `${Date.now()}-${sanitizeFileName(file.name)}`;
  const path = `${user.id}/${application.id}/${fileName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    await notify("storage_error", "Application document upload failed", uploadError.message);
    return safeErrorResponse("join.application.documents.upload", uploadError, "Upload failed");
  }

  const { data, error } = await supabaseAdmin
    .from("brand_application_documents")
    .insert({
      application_id: application.id,
      uploaded_by: user.id,
      file_name: file.name.slice(0, 200),
      storage_path: path,
      mime_type: file.type,
      file_size_bytes: file.size,
      document_type: documentType,
      upload_status: "uploaded",
    })
    .select("*")
    .single();

  if (error) {
    await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).remove([path]);
    return safeErrorResponse("join.application.documents.post", error);
  }

  if (replaceDocumentId) {
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
