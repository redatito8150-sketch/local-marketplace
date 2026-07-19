import { redirect } from "next/navigation";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { getSiteContentRowForAdmin } from "@/lib/data/admin";
import { DEFAULT_SHIPPING_SETTINGS, DEFAULT_CONTACT_INFO } from "@/content/settings";
import ShippingSettingsForm from "@/components/admin/ShippingSettingsForm";
import ContactInfoForm from "@/components/admin/ContactInfoForm";
import type { ContactInfoContent, ShippingSettingsContent } from "@/types";

export default async function AdminSettingsPage() {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");

  const [shippingRow, contactRow] = await Promise.all([
    getSiteContentRowForAdmin("shipping_settings"),
    getSiteContentRowForAdmin("contact_info"),
  ]);

  const shippingSettings =
    (shippingRow?.value as ShippingSettingsContent) ?? DEFAULT_SHIPPING_SETTINGS;
  const contactInfo = (contactRow?.value as ContactInfoContent) ?? DEFAULT_CONTACT_INFO;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">Settings</h1>
      <p className="mt-1.5 text-[13.5px] text-ink-soft/60">
        Site-wide operational settings — changes go live immediately, no code or deploy
        needed. These show up in the site footer.
      </p>

      <div className="mt-8 space-y-6">
        <ShippingSettingsForm initial={shippingSettings} />
        <ContactInfoForm initial={contactInfo} />
      </div>
    </div>
  );
}
