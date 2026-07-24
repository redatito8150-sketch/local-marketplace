import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { DOCUMENTS_BUCKET } from "@/lib/join/constants";

const SIGNED_URL_TTL_SECONDS = 120;

// Admin-only, short-lived document access — the bucket is private, so this
// is the only way an admin ever sees a document's contents. Never exposes
// getPublicUrl(); ownership is verified via the document row's own
// application_id, never trusted from the URL alone.
export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string; docId: string }> }
) {
  const params = await props.params;
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data: doc, error: fetchError } = await supabaseAdmin
    .from("brand_application_documents")
    .select("storage_path, application_id")
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
    .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    return safeErrorResponse("admin.applications.documents.signedUrl", error ?? new Error("no data"));
  }

  return NextResponse.json({ url: data.signedUrl });
}
