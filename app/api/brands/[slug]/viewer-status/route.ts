import { NextRequest, NextResponse } from "next/server";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { isUserFollowingBrand } from "@/lib/data/follows";
import { getRequestUser } from "@/lib/supabase/requestUser";

// Split out of the brand page itself so the page can stay static/ISR —
// any cookies() read (which requireUser()/requireBrandOwner() both do)
// forces the whole route dynamic under Next 15+, and this is the only
// per-viewer piece of an otherwise fully cacheable page (Follow state,
// "is this my own brand", and now inline-edit permission). Fetched
// client-side on mount instead.
export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ slug: string }> }
) {
  const params = await props.params;
  const user = await getRequestUser(_request);
  if (!user) {
    return NextResponse.json({ signedIn: false, isFollowing: false, isOwnBrand: false, canEdit: false, isAdmin: false });
  }

  const [isFollowing, ownerContext, admin] = await Promise.all([
    isUserFollowingBrand(user.id, params.slug),
    requireBrandOwner(),
    requireAdminUser(),
  ]);
  const isOwnBrand = ownerContext?.brandSlug === params.slug;
  // Inline editing on the public brand page is owner-only (not assistants,
  // same precedent as the brand-portal's own page-content editor) or any
  // platform admin — never an admin merely impersonating a *different*
  // brand via ?brand=slug in the portal, which isOwnBrand already excludes
  // since that's resolved without an override here.
  const canEdit = Boolean(admin) || (isOwnBrand && ownerContext?.accessLevel === "owner");

  return NextResponse.json({ signedIn: true, isFollowing, isOwnBrand, canEdit, isAdmin: Boolean(admin) });
}
