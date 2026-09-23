import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
export default function robots(): MetadataRoute.Robots {
  return process.env.APP_ENVIRONMENT === "production"
    ? { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/client-onboarding"] }, sitemap: `${site.url}/sitemap.xml` }
    : { rules: { userAgent: "*", disallow: "/" } };
}
