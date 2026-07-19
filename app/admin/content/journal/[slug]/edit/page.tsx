import { notFound, redirect } from "next/navigation";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { getSiteContentRowForAdmin } from "@/lib/data/admin";
import { ARTICLES, type JournalArticle } from "@/content/journal";
import JournalArticleForm from "@/components/admin/JournalArticleForm";

export default async function EditJournalArticlePage({
  params,
}: {
  params: { slug: string };
}) {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");

  const row = await getSiteContentRowForAdmin("journal_articles");
  const articles = (row?.value as JournalArticle[]) ?? ARTICLES;
  const article = articles.find((a) => a.slug === params.slug);
  if (!article) notFound();

  return (
    <div>
      <h1 className="mb-8 text-2xl font-bold tracking-tightest text-ink">Edit {article.title}</h1>
      <JournalArticleForm mode="edit" initial={article} />
    </div>
  );
}
