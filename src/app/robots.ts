import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/config";

/** robots.txt for the platform domain. Hotel sites serve their own via /sites/[site]/robots.txt. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/admin", "/preview", "/api/"] },
    sitemap: appUrl("/sitemap.xml"),
  };
}
