import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Generates /robots.txt at build time (static). Allows all crawlers and points
// at the sitemap. Tighten the rules (e.g. disallow private routes) as the app grows.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
