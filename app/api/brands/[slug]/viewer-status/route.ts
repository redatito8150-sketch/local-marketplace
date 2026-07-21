import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { isUserFollowingBrand } from "@/lib/data/follows";

// Split out of the brand page itself so the page can stay static/ISR —
// any cookies() read (which requireUser()/requireBrandOwner() both do)
// forces the whole route dynamic under Next 15+, and this is the only
// per-viewer piece of an otherwise fully cacheable page (Follow state,
// "is this my own brand"). Fetched client-side on mount instead.
export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ slug: string }> }
) {
  const params = await props.params;
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ signedIn: false, isFollowing: false, isOwnBrand: false });
  }

  const [isFollowing, ownerContext] = await Promise.all([
    isUserFollowingBrand(user.id, params.slug),
    requireBrandOwner(),
  ]);
  const isOwnBrand = ownerContext?.brandSlug === params.slug;

  return NextResponse.json({ signedIn: true, isFollowing, isOwnBrand });
}
