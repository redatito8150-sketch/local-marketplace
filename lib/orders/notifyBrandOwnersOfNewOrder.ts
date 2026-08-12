import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBrandMembersForAdmin } from "@/lib/data/admin";
import { sendEmail } from "@/lib/email/sendEmail";
import { brandNewOrderEmail } from "@/lib/email/templates/brandNewOrder";
import { groupOrderItemsByBrandSlug, type OrderItemRow } from "@/lib/orders/groupOrderItemsByBrandSlug";

export { groupOrderItemsByBrandSlug, type OrderItemRow };

// Emails every relevant brand owner about ONE order, scoped to only their
// own items — called identically from both payment paths (COD: app/api/
// orders/route.ts; card: app/api/payments/paymob/webhook/route.ts) right
// after an order actually exists. See groupOrderItemsByBrandSlug for why a
// pooled order needs per-line grouping rather than one brand per order.
//
// Never another brand's items, revenue, or the customer's full contact
// details (see brandNewOrderEmail's own scoping note, matching
// lib/data/brandPortal.ts's existing Brand Portal reads).
//
// Every owner account linked to the brand gets emailed (brands.owner_user_id
// plus any brand_staff access_level='owner' co-owner — see
// lib/data/admin.ts's getBrandMembersForAdmin) — not assistants, matching
// "Brand Owner" in the Zakhnook Project Bible's notification requirement.
// A brand with no linked owner account yet is silently skipped — not an
// error, just nobody to notify.
export async function notifyBrandOwnersOfNewOrder(orderId: string): Promise<void> {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("order_number, shipping_name, shipping_city, shipping_governorate")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;

  const { data: itemRows } = await supabaseAdmin
    .from("order_items")
    .select("id, product_id, variant_id, name, brand, brand_slug, price, currency, size, color, quantity, image")
    .eq("order_id", orderId);
  if (!itemRows || itemRows.length === 0) return;

  const itemsByBrandSlug = groupOrderItemsByBrandSlug(itemRows as unknown as OrderItemRow[]);

  for (const [brandSlug, items] of itemsByBrandSlug) {
    const members = await getBrandMembersForAdmin(brandSlug);
    const ownerEmails = (members?.owners ?? [])
      .map((owner) => owner.email)
      .filter((email): email is string => Boolean(email));
    if (ownerEmails.length === 0) continue;

    const email = brandNewOrderEmail({
      orderNumber: order.order_number,
      shippingName: order.shipping_name,
      shippingCity: order.shipping_city,
      shippingGovernorate: order.shipping_governorate,
      items,
    });
    for (const to of ownerEmails) {
      await sendEmail({ to, ...email });
    }
  }
}
