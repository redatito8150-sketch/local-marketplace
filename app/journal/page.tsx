import Image from "next/image";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ARTICLES } from "@/content/journal";
import { getSiteContentWithFallback } from "@/lib/data/siteContent";

export const metadata = {
  title: "Journal — Local",
  description:
    "Stories from the makers, studios, and ateliers behind Local's brands.",
};

export const revalidate = 60; // re-fetch site_content from Supabase at most once a minute

export default async function JournalPage() {
  const articles = await getSiteContentWithFallback("journal_articles", ARTICLES);
  const [feature, ...rest] = articles;

  return (
    <main className="min-h-screen bg-cream">
      <Header />

      <section className="mx-auto max-w-screen2xl px-8 pb-6 pt-14 lg:px-12 lg:pt-20">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-soft/50">
          Journal
        </p>
        <h1 className="mt-3 max-w-xl text-4xl font-bold leading-[1.1] tracking-tightest text-ink lg:text-5xl">
          Stories from the makers behind Local.
        </h1>
      </section>

      {!feature && (
        <section className="mx-auto max-w-screen2xl px-8 pb-20 lg:px-12">
          <p className="text-sm text-ink-soft/60">No articles yet.</p>
        </section>
      )}

      {/* Featured article */}
      {feature && (
      <section className="mx-auto max-w-screen2xl px-8 py-10 lg:px-12">
        <Link
          href={`/journal/${feature.slug}`}
          className="group grid grid-cols-1 gap-8 overflow-hidden rounded-xl3 bg-stone-50 lg:grid-cols-2"
        >
          <div className="relative min-h-[280px] lg:min-h-[420px]">
            <Image
              src={feature.image}
              alt={feature.title}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            />
          </div>
          <div className="flex flex-col justify-center px-8 py-10 lg:px-12">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">
              {feature.category}
            </span>
            <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tightest text-ink lg:text-4xl">
              {feature.title}
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-soft/70">
              {feature.excerpt}
            </p>
            <span className="mt-6 text-[13px] font-semibold text-ink underline-offset-4 group-hover:underline">
              Read the story →
            </span>
          </div>
        </Link>
      </section>
      )}

      {/* Rest of the articles */}
      <section className="mx-auto max-w-screen2xl px-8 pb-20 lg:px-12">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((article) => (
            <Link
              key={article.slug}
              href={`/journal/${article.slug}`}
              className="group"
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl2 bg-stone-100">
                <Image
                  src={article.image}
                  alt={article.title}
                  fill
                  sizes="(max-width: 1024px) 100vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <span className="mt-4 block text-xs font-semibold uppercase tracking-wide text-ink-soft/50">
                {article.category}
              </span>
              <h3 className="mt-1.5 text-lg font-semibold leading-snug text-ink">
                {article.title}
              </h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft/65">
                {article.excerpt}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
