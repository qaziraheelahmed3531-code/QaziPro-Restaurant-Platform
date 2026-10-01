import type { MetadataRoute } from "next";
import { servicePages } from "@/lib/service-pages";
import { site } from "@/lib/site";
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", "/restaurant-platform", "/services", "/pricing", "/about", "/portfolio", "/contact", "/book-a-demo", "/client-onboarding", "/get-a-quote", "/insights", "/security", "/privacy", "/terms", ...Object.keys(servicePages).map((slug) => `/${slug}`)];
  return paths.map((path) => ({ url: `${site.url}${path}`, changeFrequency: path ? "monthly" : "weekly", priority: path ? .65 : 1 }));
}
