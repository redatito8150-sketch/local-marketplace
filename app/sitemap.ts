import type { MetadataRoute } from "next";
import { SITE_URL, PUBLIC_STATIC_ROUTES } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_STATIC_ROUTES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
  }));
}
