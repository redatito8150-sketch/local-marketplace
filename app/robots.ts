import type { MetadataRoute } from "next";
import { SITE_URL, DISALLOWED_ROUTES } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: DISALLOWED_ROUTES,
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
