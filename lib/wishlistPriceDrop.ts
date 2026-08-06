import { supabaseAdmin } from "@/lib/supabase/admin";
import { isDiscountActive, getEffectivePrice } from "@/lib/pricing";
import { sendEmail } from "@/lib/email/sendEmail";
import { priceDropEmail } from "@/lib/email/templates/priceDrop";
import { notifyUser } from "@/lib/notify";
import { formatPrice } from "@/lib/format";
import { logError } from "@/lib/errorLog";

// Fires only on the genuine off -> on transition (a product save while a
// discount is *already* active, or that leaves it inactive, is a no-op) —
// that's what keeps this from re-notifying the same wishlister on every
// subsequent save while a sale runs. No standing "subscription" to clean
// up afterward, unlike back-in-stock — a wishlist is a durable list, not
// a one-shot request, so the item simply stays wishlisted.
export async function checkAndNotifyWishlistPriceDrop(
  productId: string,
  before: { discountPercent: number | null; discountEndsAt: string | null },
  after: {
    discountPercent: number | null;
    discountEndsAt: string | null;
    price: number;
    name: string;
    image: string;
    currency: "USD" | "EGP";
  }
): Promise<void> {
  try {
    const wasActive = isDiscountActive(before.discountPercent, before.discountEndsAt);
    const nowActive = isDiscountActive(after.discountPercent, after.discountEndsAt);
    if (wasActive || !nowActive) return;

    const { data: wishlisters } = await supabaseAdmin
      .from("wishlists")
      .select("user_id")
      .eq("product_id", productId);
    if (!wishlisters?.length) return;

    const discountedPrice = getEffectivePrice(after.price, after.discountPercent, after.discountEndsAt);
    const { subject, html } = priceDropEmail({
      productId,
      productName: after.name,
      image: after.image,
      originalPrice: after.price,
      discountedPrice,
      discountPercent: after.discountPercent ?? 0,
      currency: after.currency,
    });

    for (const row of wishlisters) {
      const userId = row.user_id as string;
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
      const email = userData?.user?.email;
      if (email) await sendEmail({ to: email, subject, html });
      await notifyUser(
        userId,
        "wishlist_price_drop",
        `${after.name} is now ${Math.round(after.discountPercent ?? 0)}% off`,
        `Now ${formatPrice(discountedPrice, after.currency)}, down from ${formatPrice(after.price, after.currency)}.`,
        { relatedEntityType: "product", relatedEntityId: productId }
      );
    }
  } catch (err) {
    logError("checkAndNotifyWishlistPriceDrop failed", err instanceof Error ? err.message : String(err));
  }
}
