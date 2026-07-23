const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// Deliberately permissive on script/style-src (`unsafe-inline`/`unsafe-eval`)
// — Next.js's own hydration payload and dev/HMR need them, and a stricter
// nonce-based policy is a separate, riskier change to get exactly right.
// The real value here is locking down which *external* origins can load at
// all (no more "any domain can inject a script/frame"), not a perfect CSP.
const CSP = [
  "default-src 'self'",
  // Cloudflare Turnstile's widget script (components/account/CaptchaWidget.tsx)
  // — without this, the script is CSP-blocked in every real browser and the
  // widget can never render or produce a token, regardless of app-side fixes.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  `img-src 'self' data: blob: https://images.unsplash.com https://i.imgur.com${
    supabaseUrl ? ` ${supabaseUrl}` : ""
  }`,
  `connect-src 'self' https://challenges.cloudflare.com${supabaseUrl ? ` ${supabaseUrl}` : ""}`,
  // Turnstile renders its challenge in a cross-origin iframe — with no
  // frame-src directive this falls back to default-src 'self' and blocks it.
  "frame-src 'self' https://challenges.cloudflare.com",
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
