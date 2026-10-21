import { decodeHostSegment } from "@/lib/hosts";
import { resolveHost } from "@/lib/site";

export async function GET(_req: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const r = await resolveHost(decodeHostSegment(site));
  // Non-canonical hosts redirect for pages; for robots we simply disallow everything so the
  // duplicate host is never crawled.
  if (r.type !== "site" || r.site.availability !== "live") {
    return new Response("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain" } });
  }
  const body = `User-agent: *\nAllow: /\nDisallow: /pay/\nDisallow: /enquire\n\nSitemap: ${r.site.canonicalOrigin}/sitemap.xml\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=3600" } });
}
