import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/config";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/pricing", "/signup", "/legal/terms", "/legal/privacy"].map((p) => ({ url: appUrl(p) }));
}
