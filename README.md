# Local — Marketplace Landing Page

Premium, minimal landing page for **Local**, a marketplace connecting customers with independent local brands. Built with Next.js 14 (App Router), TypeScript, Tailwind CSS, Framer Motion, and Lucide icons.

## تشغيل المشروع محلياً

```bash
# 1) فك الضغط ثم ادخل المجلد
cd local-marketplace

# 2) نصّب المكتبات
npm install

# 3) شغّل السيرفر المحلي
npm run dev

# 4) افتح المتصفح على
http://localhost:3000
```

## Build for production

```bash
npm run build
npm run start
```

## Project structure

```
local-marketplace/
├── app/
│   ├── layout.tsx      # Root layout, fonts, metadata
│   ├── page.tsx         # Assembles all sections
│   └── globals.css      # Tailwind base + Inter font
├── components/
│   ├── Header.tsx        # Sticky nav, search, wishlist, cart
│   ├── Hero.tsx           # Split hero + rotated department cards
│   ├── ExploreBoards.tsx  # Pinterest-style horizontal gallery
│   ├── Sponsored.tsx      # Featured brand campaign section
│   └── Footer.tsx         # Zalando-style multi-column footer
├── tailwind.config.ts    # Design tokens (colors, radius, shadows)
└── next.config.js         # Unsplash remote image support
```

## Notes

- Images are pulled live from Unsplash — swap the URLs in each component with your own product photography whenever you're ready.
- Colors, radii, and shadows are all defined as design tokens in `tailwind.config.ts` — change them once, they cascade everywhere.
- All animations respect `prefers-reduced-motion`.
- Fully responsive down to mobile; the desktop layout in the brief is the `lg:` breakpoint and up.
