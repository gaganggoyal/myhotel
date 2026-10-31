"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { zodMessage } from "@/lib/action";
import { audit, userActor } from "@/lib/audit";
import { requireHotel, type HotelContext } from "@/lib/auth";
import { autoWrite } from "@/lib/autowrite";
import type { SiteContent } from "@/lib/content";
import { activeDomainFor } from "@/lib/domains/service";
import { deletePhoto, HotelError, publishDraft, updateDraft } from "@/lib/hotel";
import { listPhotos } from "@/lib/media";
import {
  applyContact,
  applyCover,
  applyFacilities,
  applyLook,
  applyPlace,
  applyRooms,
  contactInput,
  facilitiesInput,
  lookInput,
  placeInput,
  roomsInput,
  SetupError,
  wizardState,
  type WizardRoom,
} from "@/lib/setup";
import { publicSiteUrl } from "@/lib/site";

export type SetupResult = { ok: true } | { ok: false; error: string };

async function photoIds(hotelId: string): Promise<string[]> {
  return (await listPhotos(hotelId)).filter((m) => m.kind === "photo").map((m) => m.id);
}

/** The draft write and readable errors shared by every step. Callers have checked the role. */
async function save(ctx: HotelContext, mutate: (c: SiteContent) => SiteContent): Promise<{ ok: true; content: SiteContent } | { ok: false; error: string }> {
  try {
    const { content } = await updateDraft(ctx.hotel.id, ctx.user.id, mutate);
    revalidatePath("/dashboard", "layout");
    return { ok: true, content };
  } catch (err) {
    if (err instanceof HotelError || err instanceof SetupError) return { ok: false, error: err.message };
    if (err instanceof z.ZodError) return { ok: false, error: zodMessage(err) };
    throw err;
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): { data: T } | { error: string } {
  const parsed = schema.safeParse(input);
  return parsed.success ? { data: parsed.data } : { error: zodMessage(parsed.error) };
}

export async function savePlaceStep(input: unknown): Promise<SetupResult> {
  const ctx = await requireHotel("manager");
  const p = parse(placeInput, input);
  if ("error" in p) return { ok: false, error: p.error };
  const r = await save(ctx, (c) => applyPlace(c, p.data));
  return r.ok ? { ok: true } : r;
}

export async function setCoverPhoto(id: unknown): Promise<SetupResult> {
  const ctx = await requireHotel("manager");
  if (typeof id !== "string" || !(await photoIds(ctx.hotel.id)).includes(id)) return { ok: false, error: "That photo is no longer in your library." };
  const r = await save(ctx, (c) => applyCover(c, id));
  return r.ok ? { ok: true } : r;
}

export async function deleteSetupPhoto(id: unknown): Promise<SetupResult> {
  if (typeof id !== "string") return { ok: false, error: "Choose a photo." };
  const ctx = await requireHotel("manager");
  try {
    await deletePhoto(ctx.hotel.id, userActor(ctx.user), id);
  } catch (err) {
    if (err instanceof HotelError) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function saveRoomsStep(input: unknown): Promise<{ ok: true; rooms: WizardRoom[] } | { ok: false; error: string }> {
  const ctx = await requireHotel("manager");
  const p = parse(roomsInput, input);
  if ("error" in p) return { ok: false, error: p.error };
  const photos = new Set(await photoIds(ctx.hotel.id));
  const r = await save(ctx, (c) => applyRooms(c, p.data.rooms, photos));
  return r.ok ? { ok: true, rooms: wizardState(r.content).rooms } : r;
}

export async function saveFacilitiesStep(input: unknown): Promise<SetupResult> {
  const ctx = await requireHotel("manager");
  const p = parse(facilitiesInput, input);
  if ("error" in p) return { ok: false, error: p.error };
  const r = await save(ctx, (c) => applyFacilities(c, p.data));
  return r.ok ? { ok: true } : r;
}

export async function saveContactStep(input: unknown): Promise<SetupResult> {
  const ctx = await requireHotel("manager");
  const p = parse(contactInput, input);
  if ("error" in p) return { ok: false, error: p.error };
  const r = await save(ctx, (c) => applyContact(c, p.data));
  return r.ok ? { ok: true } : r;
}

export async function saveLookStep(input: unknown): Promise<SetupResult> {
  const ctx = await requireHotel("manager");
  const p = parse(lookInput, input);
  if ("error" in p) return { ok: false, error: p.error };
  const r = await save(ctx, (c) => applyLook(c, p.data));
  return r.ok ? { ok: true } : r;
}

export type FinishResult =
  | { ok: true; published: true; url: string; version: number }
  | { ok: true; published: false; needsVerification: true; email: string }
  | { ok: false; error: string };

/**
 * Writes the site's text and photo descriptions from the owner's answers, then publishes.
 * Publishing still requires a verified email, like every other publish.
 */
export async function finishSetup(): Promise<FinishResult> {
  const ctx = await requireHotel("manager");
  const photos = (await listPhotos(ctx.hotel.id)).filter((m) => m.kind === "photo");
  const r = await save(ctx, (c) => autoWrite(c, photos.map((m) => m.id)));
  if (!r.ok) return r;
  const c = r.content;

  // Descriptive alt text helps guests using screen readers and Google Images.
  const db = await getDb();
  const city = c.contact.address.city;
  for (const m of photos.filter((p) => !p.alt)) {
    const room = c.rooms.find((x) => x.mediaIds.includes(m.id));
    const alt = room ? `${room.name} – ${c.property.name}` : [c.property.name, city].filter(Boolean).join(", ");
    await db.update(schema.media).set({ alt: alt.slice(0, 200) }).where(and(eq(schema.media.id, m.id), eq(schema.media.hotelId, ctx.hotel.id)));
  }
  await audit(ctx.hotel.id, userActor(ctx.user), "setup.completed", { photos: photos.length, rooms: c.rooms.length, locale: c.locale });

  if (!ctx.user.emailVerifiedAt) return { ok: true, published: false, needsVerification: true, email: ctx.user.email };
  try {
    const { version } = await publishDraft(ctx.hotel, userActor(ctx.user), "Built with quick setup");
    revalidatePath("/dashboard", "layout");
    const domain = await activeDomainFor(ctx.hotel.id);
    return { ok: true, published: true, url: publicSiteUrl(ctx.hotel.slug, domain?.hostname), version };
  } catch (err) {
    if (err instanceof HotelError) return { ok: false, error: err.message };
    throw err;
  }
}
