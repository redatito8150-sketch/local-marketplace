import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { DOCUMENTS_BUCKET } from "@/lib/join/constants";
import { safeDocumentDisplayName } from "@/lib/uploads/applicationDocument";
import { checkRateLimit } from "@/lib/rateLimit";

// Admin-only document download. The application never exposes a raw signed
// Storage URL: old and new untrusted documents are forced to download as an
// opaque attachment with MIME sniffing disabled.
export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string; docId: string }> }
) {
  const params = await props.params;
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!checkRateLimit(`admin-application-document-download:${admin.id}`, 60, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many document downloads — please slow down" }, { status: 429 });
  }

  const { data: doc, error: fetchError } = await supabaseAdmin
    .from("brand_application_documents")
    .select("storage_path, application_id, file_name, mime_type")
    .eq("id", params.docId)
    .maybeSingle();

  if (fetchError) {
    return safeErrorResponse("admin.applications.documents.signedUrl", fetchError);
  }
  if (!doc || doc.application_id !== params.id) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .download(doc.storage_path);

  if (error || !data) {
    return safeErrorResponse("admin.applications.documents.download", error ?? new Error("no data"));
  }

  const extension = doc.mime_type === "application/pdf" ? "pdf" : doc.mime_type === "image/png" ? "png" : "jpg";
  const fileName = safeDocumentDisplayName(doc.file_name || "brand-application-document", extension);
  const asciiName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-") || `brand-application-document.${extension}`;
  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Type": "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
