import { decodeHostSegment } from "@/lib/hosts";
import { resolveHost } from "@/lib/site";
import { sitePaths } from "@/site/render";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const r = await resolveHost(decodeHostSegment(site));
  if (r.type !== "site" || r.site.availability !== "live") return new Response("Not found", { status: 404 });
  const urls = sitePaths(r.site.content)
    .map((p) => `<url><loc>${r.site.canonicalOrigin}${p}</loc></url>`)
    .join("");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
