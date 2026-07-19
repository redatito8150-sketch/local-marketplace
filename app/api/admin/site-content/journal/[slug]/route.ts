import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { ARTICLES, type JournalArticle } from "@/content/journal";

function validate(body: Partial<JournalArticle>): string | null {
  if (!body.title?.trim()) return "Title is required";
  if (!body.excerpt?.trim()) return "Excerpt is required";
  if (!body.image?.trim()) return "Image URL is required";
  if (!body.category?.trim()) return "Category is required";
  if (!Array.isArray(body.body) || body.body.length === 0 || body.body.some((p) => !p.trim())) {
    return "Article body needs at least one paragraph";
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body: Partial<JournalArticle> = await request.json();
  const validationError = validate(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("site_content")
    .select("value")
    .eq("key", "journal_articles")
    .maybeSingle();

  const current = (existing?.value as JournalArticle[]) ?? ARTICLES;
  const index = current.findIndex((a) => a.slug === params.slug);
  if (index === -1) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const before = current[index];
  const updated: JournalArticle = {
    slug: params.slug,
    title: body.title!.trim(),
    excerpt: body.excerpt!.trim(),
    image: body.image!.trim(),
    category: body.category!.trim(),
    body: body.body!.map((p) => p.trim()),
  };
  const next = current.map((a, i) => (i === index ? updated : a));

  const { error } = await supabaseAdmin
    .from("site_content")
    .upsert({ key: "journal_articles", value: next, updated_at: new Date().toISOString() });

  if (error) {
    return NextResponse.json(
      { error: `Failed to save: ${error.message}` },
      { status: 500 }
    );
  }

  await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "site_content",
    entityId: `journal_articles:${params.slug}`,
    action: "update",
    before,
    after: updated,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data: existing } = await supabaseAdmin
    .from("site_content")
    .select("value")
    .eq("key", "journal_articles")
    .maybeSingle();

  const current = (existing?.value as JournalArticle[]) ?? ARTICLES;
  const before = current.find((a) => a.slug === params.slug);
  if (!before) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }
  const next = current.filter((a) => a.slug !== params.slug);

  const { error } = await supabaseAdmin
    .from("site_content")
    .upsert({ key: "journal_articles", value: next, updated_at: new Date().toISOString() });

  if (error) {
    return NextResponse.json(
      { error: `Failed to delete: ${error.message}` },
      { status: 500 }
    );
  }

  await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "site_content",
    entityId: `journal_articles:${params.slug}`,
    action: "delete",
    before,
  });

  return NextResponse.json({ ok: true });
}
