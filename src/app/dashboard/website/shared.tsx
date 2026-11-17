import type { PickerMedia } from "@/components/media";
import { requireHotel } from "@/lib/auth";
import { getDraft } from "@/lib/hotel";
import { listPhotos } from "@/lib/media";

export async function loadEditor() {
  const ctx = await requireHotel("manager");
  const [{ content, revision }, photos] = await Promise.all([getDraft(ctx.hotel.id), listPhotos(ctx.hotel.id)]);
  const media: PickerMedia[] = photos.map((p) => ({ id: p.id, alt: p.alt, thumb: `/media/${ctx.hotel.id}/${p.id}/480.webp` }));
  return { ctx, content, revision, photos, media };
}

export function Revision({ value }: { value: number }) {
  return <input type="hidden" name="revision" value={value} />;
}
