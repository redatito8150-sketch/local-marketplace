const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// Mirrors lib/seo.ts's SITE_URL resolution (NEXT_PUBLIC_SITE_URL, falling
// back to Vercel's own production/preview URL) — kept in sync there so
// admin-authored content that stores an absolute site URL (e.g. Shop by
// Mood images edited via the CMS, instead of a relative path) doesn't get
// rejected by next/image as an unconfigured remote host. Deliberately not
// a hardcoded domain string, per lib/seo.ts's own "nothing hardcodes a
// production domain" convention.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ??
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ??
  "";
const siteHostname = siteUrl ? new URL(siteUrl).hostname : "";

// `unsafe-inline` stays on script-src: Next.js inlines its own hydration
// bootstrap, and the nonce-based alternative would force every static/ISR
// route to render dynamically (the nonce has to differ per response), which
// would undo the ISR work described in CLAUDE.md. `unsafe-eval`, by
// contrast, is only ever needed by the dev-mode webpack/HMR runtime — it is
// dropped in production below, so a would-be XSS payload can no longer
// reach eval()/new Function() on the live site.
//
// This matters more than usual here: the Supabase auth cookie cannot be
// httpOnly (lib/supabase/client.ts uses @supabase/ssr's createBrowserClient,
// which reads it from document.cookie), so limiting what injected script can
// actually execute is the mitigation available for that whole class of bug.
const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = [
  "script-src 'self' 'unsafe-inline'",
  isDev ? " 'unsafe-eval'" : "",
  " https://cdn.jsdelivr.net",
].join("");

// The real value here is locking down which *external* origins can load at
// all (no more "any domain can inject a script/frame"), not a perfect CSP.
const CSP = [
  "default-src 'self'",
  // No plugins/embeds anywhere in this app, so deny outright rather than
  // letting default-src's 'self' allow same-origin ones.
  "object-src 'none'",
  // https://cdn.jsdelivr.net is where the Paymob Pixel embedded-checkout
  // widget (npm package `paymob-pixel`) is loaded from at runtime, on
  // demand, only once a customer chooses card payment on /checkout — see
  // lib/payments/paymobPixelLoader.ts. Never used for anything else.
  scriptSrc,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  // https://lh3.googleusercontent.com is where Google serves the OAuth
  // `picture`/`avatar_url` claim (components/account/AccountAvatar.tsx
  // renders it as a plain <img>) — without this the browser CSP-blocks it
  // outright and shows a broken image, regardless of any app-side fix.
  `img-src 'self' data: blob: https://images.unsplash.com https://i.imgur.com https://lh3.googleusercontent.com${
    supabaseUrl ? ` ${supabaseUrl}` : ""
  }${siteHostname ? ` https://${siteHostname}` : ""}`,
  // https://accept.paymob.com is the Egypt API host the Pixel widget itself
  // calls client-side (confirmed from the widget's own bundle) to fetch
  // payment-method/intention data using the public key + client_secret. The
  // server-side Create Intention call (lib/payments/paymob.ts) hits the
  // exact same host, not a separate accounts.paymob.com — that hostname
  // doesn't resolve in DNS at all, an earlier research error fixed
  // 2026-08-12. No separate CSP entry is needed for the server-side call
  // since browsers never enforce CSP on server-to-server fetches anyway.
  `connect-src 'self' https://accept.paymob.com${supabaseUrl ? ` ${supabaseUrl}` : ""}`,
  // The widget renders the actual card-number/CVV fields inside a
  // Paymob-hosted iframe (eg.checkout.paymob.com) for PCI compliance, even
  // though the surrounding layout is embedded inline — this is the one
  // cross-origin frame the app intentionally allows.
  "frame-src 'self' https://eg.checkout.paymob.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "i.imgur.com",
      },
      {
        protocol: "https",
        hostname: "kdrrzrboibwyxzrfwsgu.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      ...(siteHostname
        ? [
            {
              protocol: "https",
              hostname: siteHostname,
            },
          ]
        : []),
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
