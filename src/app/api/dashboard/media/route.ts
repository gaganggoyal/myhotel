import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audit, userActor } from "@/lib/audit";
import { getHotelContext } from "@/lib/auth";
import { getPlan } from "@/lib/billing/plans";
import { getSubscription } from "@/lib/billing/subscription";
import { appUrl } from "@/lib/config";
import { MediaError, savePhoto } from "@/lib/media";
import { json } from "@/lib/public-api";

/** Photo and logo uploads from the dashboard (multipart, several files at once). */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(appUrl("/")).origin) return json({ ok: false, error: "Forbidden" }, 403);
  const ctx = await getHotelContext();
  if (!ctx) return json({ ok: false, error: "Sign in again." }, 401);
  if (ctx.role === "front_desk") return json({ ok: false, error: "Only owners and managers can upload photos." }, 403);

  const form = await req.formData();
  const kind = form.get("kind") === "logo" ? "logo" : "photo";
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return json({ ok: false, error: "Choose at least one image." }, 400);

  const db = await getDb();
  const plan = getPlan((await getSubscription(ctx.hotel.id))?.planKey);
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.media)
    .where(and(eq(schema.media.hotelId, ctx.hotel.id), inArray(schema.media.kind, ["photo", "logo"]), isNull(schema.media.deletedAt)));
  if (n + files.length > plan.limits.photos) return json({ ok: false, error: `Your plan includes up to ${plan.limits.photos} photos. Delete some first.` }, 400);

  const saved: { id: string; name: string }[] = [];
  const errors: string[] = [];
  for (const file of files.slice(0, 20)) {
    try {
      const row = await savePhoto({ hotelId: ctx.hotel.id, userId: ctx.user.id, file: Buffer.from(await file.arrayBuffer()), kind });
      saved.push({ id: row.id, name: file.name });
    } catch (err) {
      if (err instanceof MediaError) errors.push(`${file.name}: ${err.message}`);
      else throw err;
    }
  }
  if (saved.length) await audit(ctx.hotel.id, userActor(ctx.user), "media.uploaded", { count: saved.length, kind });
  return json({ ok: errors.length === 0, saved, error: errors.join(" ") || undefined });
}
