"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Truck, Compass, ShieldCheck, ShoppingBag } from "lucide-react";
import { InstagramIcon, FacebookIcon, YoutubeIcon } from "@/components/shared/SocialIcons";
import Logo from "@/components/shared/Logo";
import { getSiteContentWithFallback } from "@/lib/data/siteContent";
import { DEFAULT_SHIPPING_SETTINGS, DEFAULT_CONTACT_INFO } from "@/content/settings";
import { DISCOVER_LINKS } from "@/content/navigation";
import { formatPrice } from "@/lib/format";

interface FooterLink {
  label: string;
  href?: string;
}

const SHOP_LINKS: FooterLink[] = [
  { label: "Women", href: "/shop/women" },
  { label: "Men", href: "/shop/men" },
  { label: "Kids", href: "/shop/kids" },
  { label: "Brands", href: "/brands" },
];

const DISCOVER_FOOTER_LINKS: FooterLink[] = DISCOVER_LINKS.map(({ label, href }) => ({
  label,
  href,
}));

const HELP_LINKS: FooterLink[] = [
  { label: "Frequently asked questions" },
  { label: "Payment methods" },
  { label: "Refunds" },
  { label: "Track your parcel" },
];

const ABOUT_LINKS: FooterLink[] = [
  { label: "Corporate Website" },
  { label: "Careers" },
  { label: "Newsroom" },
  { label: "Join as a Brand", href: "/join-as-a-brand" },
];

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
  links: FooterLink[];
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
          <li key={link.label}>
            <Link
              href={link.href ?? "#"}
              className="text-sm text-ink-soft/70 transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
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
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="col-span-2 sm:col-span-2 lg:col-span-1">
            <Logo />
            <p className="mt-4 max-w-[220px] text-sm leading-relaxed text-ink-soft/70">
              The marketplace designed for local brands and real stories.
            </p>
            <p className="mt-4 max-w-[220px] text-xs leading-relaxed text-ink-soft/50">
              Free delivery on orders over{" "}
              {formatPrice(shippingSettings.freeShippingThresholdEgp, "EGP")} ·{" "}
              {shippingSettings.returnPolicyDays}-day returns
            </p>
          </div>
          <FooterColumn title="Shop" links={SHOP_LINKS} icon={ShoppingBag} />
          <FooterColumn title="Discover" links={DISCOVER_FOOTER_LINKS} icon={Compass} />
          <div>
            <FooterColumn title="Help & Contact" links={HELP_LINKS} icon={ShieldCheck} />
            <p className="mt-5 text-sm text-ink-soft/70">{contactInfo.supportEmail}</p>
            <p className="mt-1 text-sm text-ink-soft/70">{contactInfo.supportPhone}</p>
            <p className="mt-1 text-sm text-ink-soft/70">{contactInfo.address}</p>
          </div>
          <FooterColumn title="About Us" links={ABOUT_LINKS} icon={Truck} />
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
            © 2026 Mahaly. All rights reserved.
          </p>

          <div className="flex items-center gap-3">
            {SOCIALS.map(({ icon: Icon, label }) => (
              <motion.a
                key={label}
                href="#"
                aria-label={label}
                whileHover={{ y: -3, scale: 1.05 }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-mahalyred text-cream transition-colors hover:bg-mahalyred-dark"
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
