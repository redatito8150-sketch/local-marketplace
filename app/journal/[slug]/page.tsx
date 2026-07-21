import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ARTICLES, type JournalArticle } from "@/content/journal";
import { getSiteContentWithFallback } from "@/lib/data/siteContent";

export const revalidate = 60; // re-fetch site_content from Supabase at most once a minute

export async function generateStaticParams() {
  const articles = await getSiteContentWithFallback("journal_articles", ARTICLES);
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const articles = await getSiteContentWithFallback("journal_articles", ARTICLES);
  const article = articles.find((a) => a.slug === params.slug);
  if (!article) return {};
  return { title: `${article.title} — Mahaly Journal`, description: article.excerpt };
}

export default async function JournalArticlePage(
  props: {
    params: Promise<{ slug: string }>;
  }
) {
  const params = await props.params;
  const articles: JournalArticle[] = await getSiteContentWithFallback("journal_articles", ARTICLES);
  const article = articles.find((a) => a.slug === params.slug);
  if (!article) notFound();

  return (
    <main className="min-h-screen bg-cream">
      <Header />

      <article className="mx-auto max-w-3xl px-8 py-14 lg:px-0 lg:py-20">
        <Link
          href="/journal"
          className="text-[13px] font-medium text-ink-soft/60 hover:text-ink"
        >
          ← Journal
        </Link>

        <span className="mt-6 block text-xs font-semibold uppercase tracking-wide text-ink-soft/50">
          {article.category}
        </span>
        <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tightest text-ink lg:text-4xl">
          {article.title}
        </h1>

        <div className="relative mt-8 aspect-[16/9] w-full overflow-hidden rounded-xl3 bg-stone-100">
          <Image
            src={article.image}
            alt={article.title}
            fill
            sizes="768px"
            className="object-cover"
          />
        </div>

        <div className="mt-10 space-y-5 text-[16px] leading-[1.85] text-ink-soft/80">
          {article.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </article>

      <Footer />
    </main>
  );
}
