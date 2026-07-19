import { redirect } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { getSiteContentRowForAdmin } from "@/lib/data/admin";
import { ARTICLES, type JournalArticle } from "@/content/journal";
import DeleteEntityButton from "@/components/admin/DeleteEntityButton";

export default async function AdminJournalPage() {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");

  const row = await getSiteContentRowForAdmin("journal_articles");
  const articles = (row?.value as JournalArticle[]) ?? ARTICLES;

  return (
    <div>
      <Link href="/admin/content" className="text-[13px] font-medium text-ink-soft/60 hover:text-ink">
        ← Site Content
      </Link>
      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tightest text-ink">
          Journal Articles ({articles.length})
        </h1>
        <Link
          href="/admin/content/journal/new"
          className="rounded-md bg-ink px-4 py-2.5 text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02]"
        >
          New article
        </Link>
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl3 border border-stone-150 bg-white">
        <table className="w-full text-left text-[13.5px]">
          <thead className="border-b border-stone-150 text-[12px] uppercase tracking-wide text-ink-soft/50">
            <tr>
              <th className="px-5 py-3 font-medium">Title</th>
              <th className="px-5 py-3 font-medium">Category</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-150">
            {articles.map((article) => (
              <tr key={article.slug}>
                <td className="px-5 py-3 font-medium text-ink">{article.title}</td>
                <td className="px-5 py-3 text-ink-soft/70">{article.category}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/content/journal/${article.slug}/edit`}
                      aria-label={`Edit ${article.title}`}
                      className="rounded-md p-1.5 text-ink-soft/60 transition-colors hover:bg-stone-100 hover:text-ink"
                    >
                      <Pencil className="h-4 w-4" strokeWidth={1.6} />
                    </Link>
                    <DeleteEntityButton
                      apiPath={`/api/admin/site-content/journal/${article.slug}`}
                      name={article.title}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {articles.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-ink-soft/60">No articles yet.</p>
        )}
      </div>
    </div>
  );
}
