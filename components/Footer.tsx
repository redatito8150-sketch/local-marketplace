"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Truck, CreditCard, ShieldCheck } from "lucide-react";
import { InstagramIcon, FacebookIcon, YoutubeIcon } from "@/components/shared/SocialIcons";
import { getSiteContentWithFallback } from "@/lib/data/siteContent";
import { DEFAULT_SHIPPING_SETTINGS, DEFAULT_CONTACT_INFO } from "@/content/settings";
import { formatPrice } from "@/lib/format";

const HELP_LINKS = [
  "Frequently asked questions",
  "Payment methods",
  "Refunds",
  "Track your parcel",
  "Subscribe to the newsletter",
];

const PAYMENT_LINKS = [
  "Payment by invoice",
  "Returns",
  "Delivery time",
  "Product Safety",
];

const GIFT_LINKS = ["Buy gift cards", "Terms and conditions", "Redeem a gift card"];

const ABOUT_LINKS = ["Corporate Website", "Careers", "Newsroom", "Investor relations"];

const SOCIALS = [
  { icon: InstagramIcon, label: "Instagram" },
  { icon: FacebookIcon, label: "Facebook" },
  { icon: YoutubeIcon, label: "YouTube" },
];

function FooterColumn({
  title,
  links,
  icon: Icon,
}: {
  title: string;
  links: string[];
  icon: React.ElementType;
}) {
  return (
    <div>
      <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-ink">
        <Icon className="h-4 w-4" strokeWidth={1.6} />
        {title}
      </div>
      <ul className="space-y-3">
        {links.map((link) => (
          <li key={link}>
            <a
              href="#"
              className="text-sm text-ink-soft/70 transition-colors hover:text-ink"
            >
              {link}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Footer() {
  // Site-wide operational settings (Round 2 Phase 4) — fetched client-side
  // via the same admin-editable site_content mechanism as the marketing
  // copy CMS, so every page that already renders this footer picks up
  // owner edits with zero changes to those call sites.
  const [shippingSettings, setShippingSettings] = useState(DEFAULT_SHIPPING_SETTINGS);
  const [contactInfo, setContactInfo] = useState(DEFAULT_CONTACT_INFO);

  useEffect(() => {
    getSiteContentWithFallback("shipping_settings", DEFAULT_SHIPPING_SETTINGS).then(
      setShippingSettings
    );
    getSiteContentWithFallback("contact_info", DEFAULT_CONTACT_INFO).then(setContactInfo);
  }, []);

  return (
    <footer id="about" className="border-t border-stone-150 bg-stone-50">
      <div className="mx-auto max-w-screen2xl px-8 py-16 lg:px-12">
        {/* Row 1 */}
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <FooterColumn title="Help & Contact" links={HELP_LINKS} icon={ShieldCheck} />
            <p className="mt-5 text-sm text-ink-soft/70">{contactInfo.supportEmail}</p>
            <p className="mt-1 text-sm text-ink-soft/70">{contactInfo.supportPhone}</p>
            <p className="mt-1 text-sm text-ink-soft/70">{contactInfo.address}</p>
          </div>
          <FooterColumn title="Gift Cards" links={GIFT_LINKS} icon={CreditCard} />
          <FooterColumn title="About Us" links={ABOUT_LINKS} icon={Truck} />
          <FooterColumn
            title="Delivery Options"
            links={[
              `Free delivery on orders over ${formatPrice(
                shippingSettings.freeShippingThresholdEgp,
                "EGP"
              )}`,
              `${shippingSettings.returnPolicyDays}-day return policy`,
              "Secure payments",
            ]}
            icon={Truck}
          />
        </div>

        {/* Row 2 — payment + promises */}
        <div className="mt-14 flex flex-col gap-8 border-t border-stone-150 pt-10 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="mb-3 text-sm font-semibold text-ink">Payment Methods</p>
            <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-ink-soft/70">
              {["MasterCard", "Visa", "PayPal", "Apple Pay", "Google Pay"].map(
                (m) => (
                  <span
                    key={m}
                    className="rounded-full border border-stone-150 bg-white px-3.5 py-1.5"
                  >
                    {m}
                  </span>
                )
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs font-medium text-ink-soft/60">
            <span>Secure Payments</span>
            <span>Fast Delivery</span>
            <span>Easy Returns</span>
            <span>Customer Support</span>
          </div>
        </div>

        {/* Row 3 — socials + copyright */}
        <div className="mt-10 flex flex-col items-center justify-between gap-6 border-t border-stone-150 pt-10 md:flex-row">
          <p className="text-sm text-ink-soft/60">
            © 2026 Local. All rights reserved.
          </p>

          <div className="flex items-center gap-3">
            {SOCIALS.map(({ icon: Icon, label }) => (
              <motion.a
                key={label}
                href="#"
                aria-label={label}
                whileHover={{ y: -3, scale: 1.05 }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-cream transition-colors hover:bg-ink-soft"
              >
                <Icon className="h-4 w-4" strokeWidth={1.7} />
              </motion.a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
