import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { subscriptionServesSite } from "./billing/subscription";
import { config, siteOrigin, subdomainHost } from "./config";
import { parseContent, type SiteContent } from "./content";
import { getDraft, referencedMediaIds } from "./hotel";
import { classifyHost } from "./hosts";
import { mediaMapFor, type MediaInfo } from "./media";
import { cacheGet, cacheSet } from "./site-cache";

const { hotels, domains, siteVersions, slugHistory, subscriptions } = schema;
type Hotel = typeof hotels.$inferSelect;

export type LoadedSite = {
  hotel: Pick<Hotel, "id" | "slug" | "name">;
  content: SiteContent;
  media: Map<string, MediaInfo>;
  /** "live" renders the site; "offline" renders a neutral maintenance page. */
  availability: "live" | "offline";
  mode: "live" | "preview";
  /** Prefix for internal links: "" on a hotel host, "/preview" in the dashboard preview. */
  basePath: string;
  /** Origin used for canonical URLs, sitemaps and absolute links. */
  canonicalOrigin: string;
};

export type Resolution =
  | { type: "site"; site: LoadedSite }
  | { type: "redirect"; host: string }
  | { type: "notfound" };

/**
 * Host → hotel. The tenant comes only from our own tables, never from anything the browser
 * sends. Unknown names 404 (a wildcard must not make unused names look live), custom
 * domains are served only once active, and every hotel has exactly one canonical host.
 */
export async function resolveHost(rawHost: string): Promise<Resolution> {
  const host = rawHost.toLowerCase();
  const cached = cacheGet<Resolution>(host);
  if (cached) return cached;
  const result = await resolveUncached(host);
  cacheSet(host, result, result.type === "site" ? result.site.hotel.id : null);
  return result;
}

async function resolveUncached(host: string): Promise<Resolution> {
  const kind = classifyHost(host, config.rootDomain);
  const db = await getDb();
  let hotel: Hotel | undefined;

  if (kind.kind === "subdomain") {
    [hotel] = await db.select().from(hotels).where(eq(hotels.slug, kind.slug));
    if (!hotel) {
      const [old] = await db.select().from(slugHistory).where(eq(slugHistory.slug, kind.slug));
      if (old) {
        const [current] = await db.select({ slug: hotels.slug }).from(hotels).where(eq(hotels.id, old.hotelId));
        if (current) return { type: "redirect", host: subdomainHost(current.slug) };
      }
      return { type: "notfound" };
    }
  } else if (kind.kind === "custom") {
    const hostname = kind.hostname.split(":")[0];
    const [d] = await db.select().from(domains).where(and(eq(domains.hostname, hostname), eq(domains.status, "active")));
    if (!d) return { type: "notfound" };
    [hotel] = await db.select().from(hotels).where(eq(hotels.id, d.hotelId));
    if (!hotel) return { type: "notfound" };
  } else {
    return { type: "notfound" };
  }

  // Canonical host: the active primary custom domain if there is one, else the subdomain.
  const [primary] = await db
    .select({ hostname: domains.hostname })
    .from(domains)
    .where(and(eq(domains.hotelId, hotel.id), eq(domains.status, "active"), eq(domains.isPrimary, true)))
    .limit(1);
  const canonicalHost = primary?.hostname ?? subdomainHost(hotel.slug);
  if (canonicalHost !== host && canonicalHost.split(":")[0] !== host.split(":")[0]) {
    return { type: "redirect", host: canonicalHost };
  }

  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.hotelId, hotel.id));
  const online = !hotel.adminSuspendedAt && hotel.siteStatus === "live" && Boolean(hotel.publishedVersionId) && subscriptionServesSite(sub ?? null);

  let content: SiteContent | null = null;
  if (hotel.publishedVersionId) {
    const [v] = await db.select({ content: siteVersions.content }).from(siteVersions).where(eq(siteVersions.id, hotel.publishedVersionId));
    if (v) content = parseContent(v.content);
  }
  if (!content) content = (await getDraft(hotel.id)).content;

  return {
    type: "site",
    site: {
      hotel: { id: hotel.id, slug: hotel.slug, name: hotel.name },
      content,
      media: online ? await mediaMapFor(hotel.id, referencedMediaIds(content)) : new Map(),
      availability: online ? "live" : "offline",
      mode: "live",
      basePath: "",
      canonicalOrigin: siteOrigin(canonicalHost),
    },
  };
}

/** The owner's unpublished draft, rendered inside the dashboard at /preview. */
export async function loadPreview(hotel: Hotel): Promise<LoadedSite> {
  const { content } = await getDraft(hotel.id);
  return {
    hotel: { id: hotel.id, slug: hotel.slug, name: hotel.name },
    content,
    media: await mediaMapFor(hotel.id, referencedMediaIds(content)),
    availability: "live",
    mode: "preview",
    basePath: "/preview",
    canonicalOrigin: siteOrigin(subdomainHost(hotel.slug)),
  };
}

export function publicSiteUrl(slug: string, customHost?: string | null): string {
  return siteOrigin(customHost ?? subdomainHost(slug));
}
