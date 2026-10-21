import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { config } from "@/lib/config";
import { decodeHostSegment } from "@/lib/hosts";
import { resolveHost } from "@/lib/site";
import { OfflinePage, SitePage, siteMetadata } from "@/site/render";

type Props = {
  params: Promise<{ site: string; path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function resolve(params: Props["params"]) {
  const { site, path = [] } = await params;
  const host = decodeHostSegment(site);
  const resolution = await resolveHost(host);
  if (resolution.type === "redirect") {
    // One canonical host per hotel: 308 with path and query preserved.
    const original = (await headers()).get("x-site-path") ?? `/${path.join("/")}`;
    permanentRedirect(`${config.protocol}://${resolution.host}${original}`);
  }
  if (resolution.type === "notfound") notFound();
  return { site: resolution.site, segments: path.map((s) => decodeURIComponent(s)) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { site, segments } = await resolve(params);
  return siteMetadata(site, segments);
}

export default async function HotelSitePage({ params, searchParams }: Props) {
  const { site, segments } = await resolve(params);
  if (site.availability === "offline") return <OfflinePage site={site} />;
  return <SitePage site={site} segments={segments} search={await searchParams} />;
}
