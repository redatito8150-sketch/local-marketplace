import { redirect } from "next/navigation";

export default async function BrandPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/brands/${slug}/products`);
}
