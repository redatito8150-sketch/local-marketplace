import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { ARTICLES, type JournalArticle } from "@/content/journal";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

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

// Journal articles are stored as one row (key="journal_articles") holding
// the whole JournalArticle[] array — the admin list adds/edits/removes
// entries by reading the array, mutating it, and writing it back.
export async function POST(request: NextRequest) {
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
  const slug = slugify(body.title!);
  if (!slug) {
    return NextResponse.json({ error: "Title must contain letters or numbers" }, { status: 400 });
  }
  if (current.some((a) => a.slug === slug)) {
    return NextResponse.json(
      { error: "An article with a matching title already exists" },
      { status: 409 }
    );
  }

  const article: JournalArticle = {
    slug,
    title: body.title!.trim(),
    excerpt: body.excerpt!.trim(),
    image: body.image!.trim(),
    category: body.category!.trim(),
    body: body.body!.map((p) => p.trim()),
  };
  const next = [article, ...current];

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
    entityId: `journal_articles:${slug}`,
    action: "create",
    after: article,
  });

  return NextResponse.json({ slug });
}
