import { notFound } from "next/navigation";
import Header from "@/components/Header";
import BrandFooter from "@/components/brand/BrandFooter";
import BrandProfileHeader from "@/components/brand/BrandProfileHeader";
import { BrandEditProvider } from "@/components/brand/BrandEditContext";
import { getBrandContent } from "@/lib/data/brands";

export const revalidate = 60;

export default async function BrandProfileLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brand = await getBrandContent(slug);
  if (!brand) notFound();
  return (
    <BrandEditProvider brandSlug={slug}>
      <main className="min-h-screen bg-[#fbf7f1]"><Header /><BrandProfileHeader brand={brand} />{children}<BrandFooter /></main>
    </BrandEditProvider>
  );
}
