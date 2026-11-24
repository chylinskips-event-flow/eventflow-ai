import type { MetadataRoute } from "next";
import { getSiteUrl, SITEMAP_PATHS } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  return SITEMAP_PATHS.map((path) => ({
    url: path === "/" ? base : `${base}${path}`,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.3,
  }));
}
