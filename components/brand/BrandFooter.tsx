"use client";

import { Instagram, Facebook, Music2, Send } from "lucide-react";

const COLUMNS: { title: string; links: string[] }[] = [
  { title: "Shop", links: ["Women", "Men", "Beauty", "Home", "New Arrivals"] },
  { title: "Discover", links: ["Brands", "Journal", "Edits", "Egyptian Makers"] },
  { title: "About LOCAL", links: ["Our Story", "Careers", "Press", "Sustainability"] },
  { title: "For Brands", links: ["Join as a Brand", "Seller Guidelines", "Brand Support"] },
  { title: "Help", links: ["Contact Us", "Shipping", "Returns", "FAQ"] },
];

export default function BrandFooter() {
  return (
    <footer className="border-t border-hairline bg-white">
      <div className="mx-auto max-w-brand px-6 py-20 lg:px-10">
        <div className="grid grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-3 lg:grid-cols-6">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-[13px] font-semibold tracking-wide text-charcoal">
                {col.title}
              </h4>
              <ul className="mt-5 space-y-3">
                {col.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-[13px] font-light text-muted transition-colors hover:text-charcoal"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h4 className="text-[13px] font-semibold tracking-wide text-charcoal">
              Newsletter
            </h4>
            <p className="mt-5 text-[13px] font-light leading-relaxed text-muted">
              New Egyptian brands, delivered monthly.
            </p>
            <form
              onSubmit={(e) => e.preventDefault()}
              className="mt-4 flex items-center gap-2"
            >
              <label htmlFor="newsletter-email" className="sr-only">
                Email address
              </label>
              <input
                id="newsletter-email"
                type="email"
                placeholder="Email"
                className="w-full min-w-0 border-b border-hairline bg-transparent py-1.5 text-[13px] text-charcoal outline-none placeholder:text-muted/70 focus:border-navy"
              />
              <button
                type="submit"
                aria-label="Subscribe"
                className="flex-none rounded-full p-1.5 text-navy transition-colors hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy"
              >
                <Send className="h-4 w-4" strokeWidth={1.6} />
              </button>
            </form>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-6 border-t border-hairline pt-8 sm:flex-row">
          <p className="text-[13px] font-light text-muted">
            LOCAL — Discover Egyptian Brands.
          </p>

          <div className="flex items-center gap-4">
            <a
              href="#"
              aria-label="Instagram"
              className="text-charcoal/60 transition-colors hover:text-charcoal"
            >
              <Instagram className="h-[18px] w-[18px]" strokeWidth={1.5} />
            </a>
            <a
              href="#"
              aria-label="Facebook"
              className="text-charcoal/60 transition-colors hover:text-charcoal"
            >
              <Facebook className="h-[18px] w-[18px]" strokeWidth={1.5} />
            </a>
            <a
              href="#"
              aria-label="TikTok"
              className="text-charcoal/60 transition-colors hover:text-charcoal"
            >
              <Music2 className="h-[18px] w-[18px]" strokeWidth={1.5} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
