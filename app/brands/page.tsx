import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BadgeCheck, MapPinned, Shapes } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BrandsDirectory from "@/components/brands/BrandsDirectory";
import { getFeaturedBrands } from "@/lib/data/brands";

export const revalidate = 60;

export const metadata = {
  title: "Local Brands — Mahaly",
  description: "Discover independent Egyptian brands, makers, and the stories behind what they create.",
};

export default async function BrandsDirectoryPage() {
  const brands = await getFeaturedBrands();
  const categoryCount = new Set(
    brands.flatMap((brand) => [brand.category, ...brand.additionalCategories])
  ).size;
  const cityCount = new Set(brands.map((brand) => brand.city)).size;

  return (
    <main className="flex min-h-screen flex-col [&>*]:w-full overflow-hidden bg-[#f7f1e9] text-[#211b17]">
      <Header warmTransparent />

      <section className="mx-auto max-w-screen2xl px-4 pb-8 pt-8 sm:px-6 lg:px-12 lg:pb-10 lg:pt-10">
        <div className="grid gap-6 lg:grid-cols-[0.78fr_1.42fr] lg:items-stretch">
          <div className="flex flex-col justify-center px-1 py-4 lg:py-8">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#a23d34]">Our brands</p>
            <h1 className="mt-4 max-w-lg text-[clamp(2.8rem,5vw,5.5rem)] font-bold leading-[0.94] tracking-[-0.055em] text-[#1e1916]">
              Local brands.<br />Real stories.
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-7 text-[#665c54]">
              Discover independent brands and makers from across Egypt. Every purchase supports a creator, not a warehouse.
            </p>

            <div className="mt-8 grid max-w-md grid-cols-3 gap-2.5">
              <div className="rounded-2xl border border-[#e1d6c9] bg-white/45 px-3 py-4 text-center">
                <BadgeCheck className="mx-auto h-5 w-5 text-[#9d3d34]" />
                <strong className="mt-2 block text-lg">{brands.length}+</strong>
                <span className="text-[11px] text-[#776b62]">Brands</span>
              </div>
              <div className="rounded-2xl border border-[#e1d6c9] bg-white/45 px-3 py-4 text-center">
                <Shapes className="mx-auto h-5 w-5 text-[#9d3d34]" />
                <strong className="mt-2 block text-lg">{categoryCount}</strong>
                <span className="text-[11px] text-[#776b62]">Categories</span>
              </div>
              <div className="rounded-2xl border border-[#e1d6c9] bg-white/45 px-3 py-4 text-center">
                <MapPinned className="mx-auto h-5 w-5 text-[#9d3d34]" />
                <strong className="mt-2 block text-lg">{cityCount}</strong>
                <span className="text-[11px] text-[#776b62]">Cities</span>
              </div>
            </div>
          </div>

          <div className="group relative min-h-[420px] overflow-hidden rounded-[28px] border border-white/40 bg-[#5e3728] shadow-[0_24px_70px_rgba(63,36,25,0.18)] lg:min-h-[500px]">
            <Image
              src="/images/brands/directory/brands-hero.png"
              alt="An Egyptian founder curating locally made fashion, homeware, and beauty products"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 64vw"
              className="object-cover transition duration-[1400ms] ease-out group-hover:scale-[1.025]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#1c0d08]/70 via-[#1c0d08]/15 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#1d0d08]/65 to-transparent px-6 pb-7 pt-28 sm:px-8 sm:pb-8">
              <p className="max-w-sm text-[clamp(1.35rem,3vw,2.15rem)] font-semibold leading-tight tracking-[-0.035em] text-white">
                You can now join us to sell on “Mahaly”
              </p>
              <Link href="/join-as-a-brand/apply" className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-xs font-bold text-[#4a1e1a] shadow-lg transition hover:-translate-y-0.5 hover:bg-[#fff7ef]">
                Apply Now <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <BrandsDirectory brands={brands} />
      <Footer />
    </main>
  );
}
