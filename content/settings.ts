// Static defaults for site-wide operational settings — the fallback used
// whenever no admin-edited "shipping_settings" / "contact_info" row exists
// in site_content (see lib/data/siteContent.ts and app/admin/settings).

import type { ContactInfoContent, ShippingSettingsContent } from "@/types";

export const DEFAULT_SHIPPING_SETTINGS: ShippingSettingsContent = {
  freeShippingThresholdEgp: 1500,
  returnPolicyDays: 30,
};

export const DEFAULT_CONTACT_INFO: ContactInfoContent = {
  supportEmail: "support@local.example",
  supportPhone: "+20 100 000 0000",
  address: "Cairo, Egypt",
};
