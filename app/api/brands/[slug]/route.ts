import { NextRequest, NextResponse } from "next/server";
import { getBrandContent } from "@/lib/data/brands";
import { isUserFollowingBrand } from "@/lib/data/follows";
import { getPublicReviews } from "@/lib/reviews/data";
import { getRequestUser } from "@/lib/supabase/requestUser";

export async function GET(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const brand = await getBrandContent(slug);
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  const user = await getRequestUser(request);
  const [reviews, isFollowing] = await Promise.all([
    getPublicReviews({ brandSlug: slug, filters: { photos: false, verified: false, replied: false, sort: "recent", page: 1 } }),
    user ? isUserFollowingBrand(user.id, slug) : false
  ]);
  return NextResponse.json({ brand, reviews, isFollowing });
}
