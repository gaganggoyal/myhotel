import { and, desc, eq, inArray, isNull, max } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audit, type AuditActor } from "./audit";
import { startTrial } from "./billing/subscription";
import { defaultContent, parseContent, publishChecklist, type PropertyType, type SiteContent } from "./content";
import { normalizeSlug, validateSlug } from "./hosts";
import { invalidateHotel } from "./site-cache";

const { hotels, memberships, siteDrafts, siteVersions, slugHistory, media } = schema;
type Hotel = typeof hotels.$inferSelect;

export class HotelError extends Error {}

export async function isSlugAvailable(slug: string, exceptHotelId?: string): Promise<boolean> {
  const db = await getDb();
  const [taken] = await db.select({ id: hotels.id }).from(hotels).where(eq(hotels.slug, slug));
  if (taken && taken.id !== exceptHotelId) return false;
  const [retired] = await db.select({ hotelId: slugHistory.hotelId }).from(slugHistory).where(eq(slugHistory.slug, slug));
  // Retired slugs are never reissued to a different property.
  if (retired && retired.hotelId !== exceptHotelId) return false;
  return true;
}

export async function suggestSlug(name: string): Promise<string> {
  const base = normalizeSlug(name) || "my-hotel";
  let candidate = base.length >= 3 ? base : `${base}-stay`;
  for (let i = 2; i < 50; i++) {
    if (!validateSlug(candidate) && (await isSlugAvailable(candidate))) return candidate;
    candidate = `${base}-${i}`.slice(0, 63);
  }
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function createHotel(input: {
  userId: string;
  name: string;
  slug: string;
  type: PropertyType;
  city: string;
  state: string;
  phone: string;
  email: string;
}): Promise<Hotel> {
  const slug = normalizeSlug(input.slug);
  const problem = validateSlug(slug);
  if (problem) throw new HotelError(problem);
  if (!(await isSlugAvailable(slug))) throw new HotelError("That web address is taken. Try another.");
  const db = await getDb();
  const content = defaultContent(input);
  const hotel = await db.transaction(async (tx) => {
    const [h] = await tx.insert(hotels).values({ slug, name: input.name.trim() }).returning();
    await tx.insert(memberships).values({ hotelId: h.id, userId: input.userId, role: "owner" });
    await tx.insert(siteDrafts).values({ hotelId: h.id, content, updatedBy: input.userId });
    return h;
  });
  await startTrial(hotel.id);
  await audit(hotel.id, { userId: input.userId, label: input.email }, "hotel.created", { slug });
  return hotel;
}

export async function getDraft(hotelId: string): Promise<{ content: SiteContent; revision: number; updatedAt: Date }> {
  const db = await getDb();
  const [d] = await db.select().from(siteDrafts).where(eq(siteDrafts.hotelId, hotelId));
  if (!d) throw new HotelError("Draft not found");
  return { content: parseContent(d.content), revision: d.revision, updatedAt: d.updatedAt };
}

/**
 * Read-modify-write of the draft with optimistic concurrency: if someone else saved since
 * `expectedRevision`, the update is refused rather than silently overwriting their work.
 */
export async function updateDraft(
  hotelId: string,
  userId: string,
  mutate: (c: SiteContent) => SiteContent,
  expectedRevision?: number,
): Promise<{ content: SiteContent; revision: number }> {
  const db = await getDb();
  const current = await getDraft(hotelId);
  if (expectedRevision != null && expectedRevision !== current.revision) {
    throw new HotelError("Someone else saved changes since you opened this page. Reload to see them, then try again.");
  }
  const next = parseContent(mutate(structuredClone(current.content)));
  const updated = await db
    .update(siteDrafts)
    .set({ content: next, revision: current.revision + 1, updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(siteDrafts.hotelId, hotelId), eq(siteDrafts.revision, current.revision)))
    .returning({ revision: siteDrafts.revision });
  if (!updated.length) throw new HotelError("Your changes conflicted with another save. Reload and try again.");
  return { content: next, revision: updated[0].revision };
}

export async function hasPhotos(hotelId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.hotelId, hotelId), eq(media.kind, "photo"), isNull(media.deletedAt)))
    .limit(1);
  return Boolean(row);
}

export async function publishDraft(hotel: Hotel, actor: AuditActor & { userId: string }, note?: string): Promise<{ version: number }> {
  const db = await getDb();
  const { content } = await getDraft(hotel.id);
  const check = publishChecklist(content, await hasPhotos(hotel.id));
  if (check.blocking.length) throw new HotelError(`Before publishing: ${check.blocking.join(" ")}`);
  const version = await db.transaction(async (tx) => {
    const [{ v }] = await tx.select({ v: max(siteVersions.version) }).from(siteVersions).where(eq(siteVersions.hotelId, hotel.id));
    const next = (v ?? 0) + 1;
    const [row] = await tx.insert(siteVersions).values({ hotelId: hotel.id, version: next, content, note: note?.slice(0, 200) ?? null, publishedBy: actor.userId }).returning();
    await tx.update(hotels).set({ publishedVersionId: row.id, siteStatus: "live", name: content.property.name, updatedAt: new Date() }).where(eq(hotels.id, hotel.id));
    return next;
  });
  invalidateHotel(hotel.id);
  await audit(hotel.id, actor, "site.published", { version });
  return { version };
}

/** Rollback = publish an older snapshot as a new version, and load it into the draft. */
export async function restoreVersion(hotel: Hotel, versionId: string, actor: AuditActor & { userId: string }): Promise<{ version: number }> {
  const db = await getDb();
  const [old] = await db.select().from(siteVersions).where(and(eq(siteVersions.id, versionId), eq(siteVersions.hotelId, hotel.id)));
  if (!old) throw new HotelError("Version not found");
  const content = parseContent(old.content);
  const version = await db.transaction(async (tx) => {
    const [{ v }] = await tx.select({ v: max(siteVersions.version) }).from(siteVersions).where(eq(siteVersions.hotelId, hotel.id));
    const next = (v ?? 0) + 1;
    const [row] = await tx.insert(siteVersions).values({ hotelId: hotel.id, version: next, content, note: `Restored version ${old.version}`, publishedBy: actor.userId }).returning();
    await tx.update(hotels).set({ publishedVersionId: row.id, siteStatus: "live", updatedAt: new Date() }).where(eq(hotels.id, hotel.id));
    const [d] = await tx.select({ revision: siteDrafts.revision }).from(siteDrafts).where(eq(siteDrafts.hotelId, hotel.id));
    await tx.update(siteDrafts).set({ content, revision: (d?.revision ?? 0) + 1, updatedBy: actor.userId, updatedAt: new Date() }).where(eq(siteDrafts.hotelId, hotel.id));
    return next;
  });
  invalidateHotel(hotel.id);
  await audit(hotel.id, actor, "site.restored", { from: old.version, version });
  return { version };
}

export async function setSiteOnline(hotel: Hotel, online: boolean, actor: AuditActor): Promise<void> {
  const db = await getDb();
  if (online && !hotel.publishedVersionId) throw new HotelError("Publish your site first.");
  await db.update(hotels).set({ siteStatus: online ? "live" : "unpublished", updatedAt: new Date() }).where(eq(hotels.id, hotel.id));
  invalidateHotel(hotel.id);
  await audit(hotel.id, actor, online ? "site.online" : "site.offline");
}

/** Renaming keeps the old slug as a permanent redirect; it is never given to another hotel. */
export async function changeSlug(hotel: Hotel, rawSlug: string, actor: AuditActor): Promise<string> {
  const slug = normalizeSlug(rawSlug);
  if (slug === hotel.slug) return slug;
  const problem = validateSlug(slug);
  if (problem) throw new HotelError(problem);
  if (!(await isSlugAvailable(slug, hotel.id))) throw new HotelError("That web address is taken.");
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.insert(slugHistory).values({ slug: hotel.slug, hotelId: hotel.id }).onConflictDoNothing();
    await tx.delete(slugHistory).where(and(eq(slugHistory.slug, slug), eq(slugHistory.hotelId, hotel.id)));
    await tx.update(hotels).set({ slug, updatedAt: new Date() }).where(eq(hotels.id, hotel.id));
  });
  invalidateHotel(hotel.id);
  await audit(hotel.id, actor, "hotel.slug_changed", { from: hotel.slug, to: slug });
  return slug;
}

export async function listVersions(hotelId: string) {
  const db = await getDb();
  return db
    .select({ id: siteVersions.id, version: siteVersions.version, note: siteVersions.note, publishedAt: siteVersions.publishedAt, publishedBy: siteVersions.publishedBy })
    .from(siteVersions)
    .where(eq(siteVersions.hotelId, hotelId))
    .orderBy(desc(siteVersions.version))
    .limit(30);
}

/** Media ids referenced anywhere in a content document (for rendering and safe deletion). */
export function referencedMediaIds(c: SiteContent): string[] {
  const ids = [
    ...c.hero.mediaIds,
    ...c.gallery.mediaIds,
    ...c.dining.mediaIds,
    ...c.rooms.flatMap((r) => r.mediaIds),
    ...(c.logoMediaId ? [c.logoMediaId] : []),
    ...(c.seo.ogMediaId ? [c.seo.ogMediaId] : []),
  ];
  return Array.from(new Set(ids));
}

export async function hotelsByIds(ids: string[]) {
  if (!ids.length) return [];
  const db = await getDb();
  return db.select().from(hotels).where(inArray(hotels.id, ids));
}
