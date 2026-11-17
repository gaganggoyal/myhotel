import { requireHotel } from "@/lib/auth";
import { activeDomainFor } from "@/lib/domains/service";
import { getDraft } from "@/lib/hotel";
import { listPhotos } from "@/lib/media";
import { wizardState } from "@/lib/setup";
import { publicSiteUrl } from "@/lib/site";
import { SetupWizard } from "./wizard";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { hotel } = await requireHotel("manager");
  const [{ content }, library, domain] = await Promise.all([getDraft(hotel.id), listPhotos(hotel.id), activeDomainFor(hotel.id)]);
  const { step } = await searchParams;
  const photos = library.filter((m) => m.kind === "photo").map((m) => ({ id: m.id, thumb: `/media/${hotel.id}/${m.id}/${m.variants[0] ?? 480}.webp` }));
  return (
    <SetupWizard
      initial={wizardState(content)}
      photos={photos}
      startAtFinish={step === "finish"}
      siteUrl={publicSiteUrl(hotel.slug, domain?.hostname)}
      published={Boolean(hotel.publishedVersionId)}
    />
  );
}
