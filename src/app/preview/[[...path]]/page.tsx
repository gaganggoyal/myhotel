import type { Metadata } from "next";
import { requireHotel } from "@/lib/auth";
import { loadPreview } from "@/lib/site";
import { SitePage, siteMetadata } from "@/site/render";

type Props = {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hotel } = await requireHotel();
  const { path = [] } = await params;
  return { ...siteMetadata(await loadPreview(hotel), path), robots: { index: false, follow: false } };
}

/** The owner's unpublished draft, exactly as guests will see it after publishing. */
export default async function PreviewPage({ params, searchParams }: Props) {
  const { hotel } = await requireHotel();
  const { path = [] } = await params;
  const site = await loadPreview(hotel);
  return <SitePage site={site} segments={path.map((s) => decodeURIComponent(s))} search={await searchParams} />;
}
