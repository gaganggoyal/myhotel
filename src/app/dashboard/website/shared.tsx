import Link from "next/link";
import type { PickerMedia } from "@/components/media";
import { buttonClass, cx } from "@/components/ui";
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

const STEPS = [
  { label: "Property", href: "/onboarding" },
  { label: "Rooms", href: "/dashboard/website/rooms?onboarding=1" },
  { label: "Photos", href: "/dashboard/website/photos?onboarding=1" },
  { label: "Design", href: "/dashboard/website/design?onboarding=1" },
  { label: "Publish", href: "/dashboard/publish?onboarding=1" },
];

/** Guided first-run flow across the editor pages (shown when ?onboarding=1). */
export function OnboardingSteps({ step, show }: { step: 2 | 3 | 4 | 5; show: boolean }) {
  if (!show) return null;
  const next = STEPS[step];
  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <ol className="flex flex-wrap gap-2 text-xs font-semibold">
        {STEPS.map((s, i) => (
          <li key={s.label} className={cx("rounded-full px-3 py-1", i + 1 < step ? "bg-emerald-600 text-white" : i + 1 === step ? "bg-slate-900 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200")}>
            {i + 1}. {s.label}
          </li>
        ))}
      </ol>
      {next ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-amber-900">
          <span>Save this step, then continue. You can always come back.</span>
          <Link href={next.href} className={buttonClass("primary", "py-2")}>
            Next: {next.label} →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
