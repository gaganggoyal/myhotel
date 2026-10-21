"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { bool, fail, int, list, ok, str, type ActionState } from "@/lib/action";
import { audit, userActor } from "@/lib/audit";
import { requireHotel } from "@/lib/auth";
import { getPlan } from "@/lib/billing/plans";
import { getSubscription } from "@/lib/billing/subscription";
import { contactSchema, newId, PROPERTY_TYPES, policiesSchema, roomSchema, slugifyRoom, TEMPLATES, type SiteContent } from "@/lib/content";
import { parseRupeesToPaise } from "@/lib/format";
import { HotelError, updateDraft } from "@/lib/hotel";

const SAVED = "Saved to your draft. Publish when you’re ready for guests to see it.";

/** Shared wrapper: auth (owners/managers), optimistic revision check, revalidation, errors. */
async function edit(fd: FormData, mutate: (c: SiteContent) => SiteContent | string, message = SAVED): Promise<ActionState> {
  const ctx = await requireHotel("manager");
  const revisionRaw = str(fd, "revision");
  try {
    await updateDraft(
      ctx.hotel.id,
      ctx.user.id,
      (c) => {
        const r = mutate(c);
        // Throwing aborts before the write, so a rejected edit never bumps the revision.
        if (typeof r === "string") throw new HotelError(r);
        return r;
      },
      revisionRaw ? Number(revisionRaw) : undefined,
    );
  } catch (err) {
    if (err instanceof HotelError) return fail(err.message);
    if (err instanceof z.ZodError) return fail(err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 2).join(" "));
    throw err;
  }
  revalidatePath("/dashboard", "layout");
  return ok(message);
}

const ids = (fd: FormData, name: string) =>
  str(fd, name, 4000)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export async function savePropertyAction(_: ActionState, fd: FormData) {
  const type = str(fd, "type");
  if (!PROPERTY_TYPES.includes(type as (typeof PROPERTY_TYPES)[number])) return fail("Choose a property type.");
  const name = str(fd, "name", 80);
  if (name.length < 2) return fail("Property name is required.");
  return edit(fd, (c) => ({
    ...c,
    property: { name, type: type as SiteContent["property"]["type"], tagline: str(fd, "tagline", 120), description: str(fd, "description", 4000), whyDirect: str(fd, "whyDirect", 160) },
    hero: { ...c.hero, headline: str(fd, "headline", 90), subheadline: str(fd, "subheadline", 200), mediaIds: ids(fd, "heroMediaIds").slice(0, 6) },
  }));
}

export async function saveContactAction(_: ActionState, fd: FormData) {
  const parsed = contactSchema.safeParse({
    phone: str(fd, "phone"),
    whatsapp: str(fd, "whatsapp"),
    email: str(fd, "email"),
    address: {
      line1: str(fd, "line1"),
      line2: str(fd, "line2"),
      locality: str(fd, "locality"),
      city: str(fd, "city"),
      state: str(fd, "state"),
      postalCode: str(fd, "postalCode"),
      country: str(fd, "country") || "India",
    },
    mapQuery: str(fd, "mapQuery"),
    directions: str(fd, "directions"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if (!parsed.data.phone && !parsed.data.whatsapp) return fail("Add at least a phone or WhatsApp number.");
  return edit(fd, (c) => ({ ...c, contact: parsed.data }));
}

export async function saveRoomAction(_: ActionState, fd: FormData) {
  const ctx = await requireHotel("manager");
  const id = str(fd, "id");
  const priceRaw = str(fd, "fromPrice");
  const fromPrice = priceRaw ? parseRupeesToPaise(priceRaw) : null;
  if (priceRaw && fromPrice == null) return fail("Enter the price in rupees, e.g. 3500.");
  const sizeRaw = str(fd, "sizeSqft");
  const custom = str(fd, "customAmenities", 1000)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const base = {
    name: str(fd, "name", 80),
    summary: str(fd, "summary", 200),
    description: str(fd, "description", 3000),
    bedType: str(fd, "bedType", 60),
    maxAdults: int(fd, "maxAdults", 2),
    maxChildren: int(fd, "maxChildren", 0),
    sizeSqft: sizeRaw ? int(fd, "sizeSqft", 0) : null,
    view: str(fd, "view", 60),
    amenities: [...list(fd, "amenities"), ...custom].slice(0, 40),
    fromPrice,
    mediaIds: ids(fd, "mediaIds").slice(0, 20),
    visible: bool(fd, "visible"),
  };
  const plan = getPlan((await getSubscription(ctx.hotel.id))?.planKey);
  return edit(fd, (c) => {
    const rooms = [...c.rooms];
    const idx = rooms.findIndex((r) => r.id === id);
    if (idx === -1 && rooms.length >= plan.limits.roomTypes) return `Your plan includes up to ${plan.limits.roomTypes} room types.`;
    const existing = idx >= 0 ? rooms[idx] : null;
    const slug = existing && existing.name === base.name ? existing.slug : slugifyRoom(base.name, rooms.filter((r) => r.id !== id).map((r) => r.slug));
    const parsed = roomSchema.safeParse({ ...base, id: existing?.id ?? newId(), slug });
    if (!parsed.success) return parsed.error.issues[0].message;
    if (idx >= 0) rooms[idx] = parsed.data;
    else rooms.push(parsed.data);
    return { ...c, rooms };
  });
}

export async function roomOrderAction(_: ActionState, fd: FormData) {
  const id = str(fd, "id");
  const op = str(fd, "op");
  return edit(
    fd,
    (c) => {
      const rooms = [...c.rooms];
      const i = rooms.findIndex((r) => r.id === id);
      if (i < 0) return "Room not found.";
      if (op === "delete") rooms.splice(i, 1);
      else if (op === "up" && i > 0) [rooms[i - 1], rooms[i]] = [rooms[i], rooms[i - 1]];
      else if (op === "down" && i < rooms.length - 1) [rooms[i + 1], rooms[i]] = [rooms[i], rooms[i + 1]];
      else if (op === "toggle") rooms[i] = { ...rooms[i], visible: !rooms[i].visible };
      return { ...c, rooms };
    },
    op === "delete" ? "Room removed from your draft." : "Updated.",
  );
}

export async function saveAmenitiesAction(_: ActionState, fd: FormData) {
  const custom = str(fd, "custom", 3000)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return edit(fd, (c) => ({ ...c, amenities: Array.from(new Set([...list(fd, "amenities"), ...custom])).slice(0, 80) }));
}

export async function savePoliciesAction(_: ActionState, fd: FormData) {
  const parsed = policiesSchema.safeParse({
    checkIn: str(fd, "checkIn") || "12:00",
    checkOut: str(fd, "checkOut") || "11:00",
    cancellation: str(fd, "cancellation"),
    payment: str(fd, "payment"),
    children: str(fd, "children"),
    pets: str(fd, "pets"),
    smoking: str(fd, "smoking"),
    idProof: str(fd, "idProof"),
    houseRules: str(fd, "houseRules"),
    taxNote: str(fd, "taxNote"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if (!parsed.data.cancellation) return fail("Your cancellation policy is required. Guests look for it before they enquire.");
  return edit(fd, (c) => ({ ...c, policies: parsed.data }));
}

function blocks(text: string): string[][] {
  return text
    .split(/\n\s*\n/)
    .map((b) =>
      b
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    )
    .filter((b) => b.length);
}

export async function savePagesAction(_: ActionState, fd: FormData) {
  const nearby = str(fd, "nearby", 4000)
    .split("\n")
    .map((l) => l.split("|").map((s) => s.trim()))
    .filter((p) => p[0])
    .slice(0, 20)
    .map(([name, distance = "", note = ""]) => ({ name: name.slice(0, 80), distance: distance.slice(0, 40), note: note.slice(0, 200) }));
  const faq = blocks(str(fd, "faq", 20000))
    .filter((b) => b.length >= 2)
    .slice(0, 30)
    .map(([q, ...a]) => ({ q: q.replace(/^q[:.]\s*/i, "").slice(0, 200), a: a.join("\n").replace(/^a[:.]\s*/i, "").slice(0, 1500) }));
  const testimonials = blocks(str(fd, "testimonials", 10000))
    .slice(0, 12)
    .map((b) => {
      const last = b[b.length - 1];
      const hasAuthor = b.length > 1 && /^[—–-]/.test(last);
      const [author, source = ""] = hasAuthor ? last.replace(/^[—–-]\s*/, "").split(",").map((s) => s.trim()) : ["Guest", ""];
      return { quote: (hasAuthor ? b.slice(0, -1) : b).join(" ").replace(/^["“]|["”]$/g, "").slice(0, 600), author: author.slice(0, 80) || "Guest", source: source.slice(0, 60) };
    });
  return edit(fd, (c) => ({
    ...c,
    sections: {
      gallery: bool(fd, "s_gallery"),
      dining: bool(fd, "s_dining"),
      nearby: bool(fd, "s_nearby"),
      faq: bool(fd, "s_faq"),
      offers: bool(fd, "s_offers"),
      testimonials: bool(fd, "s_testimonials"),
    },
    about: { title: str(fd, "aboutTitle", 80), body: str(fd, "aboutBody", 5000) },
    dining: { title: str(fd, "diningTitle", 80), body: str(fd, "diningBody", 3000), mediaIds: ids(fd, "diningMediaIds").slice(0, 12) },
    nearby,
    faq,
    testimonials,
  }));
}

export async function saveOfferAction(_: ActionState, fd: FormData) {
  const op = str(fd, "op");
  const id = str(fd, "id");
  if (op === "delete") return edit(fd, (c) => ({ ...c, offers: c.offers.filter((o) => o.id !== id) }), "Offer removed.");
  const title = str(fd, "title", 100);
  if (!title) return fail("Give the offer a title.");
  const validUntil = str(fd, "validUntil");
  if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) return fail("Use a valid date.");
  return edit(fd, (c) => {
    if (c.offers.length >= 10) return "Up to 10 offers.";
    return { ...c, offers: [...c.offers, { id: newId(), title, body: str(fd, "body", 1000), code: str(fd, "code", 30).toUpperCase(), validUntil }], sections: { ...c.sections, offers: true } };
  }, "Offer added.");
}

export async function saveGalleryAction(_: ActionState, fd: FormData) {
  return edit(fd, (c) => ({ ...c, gallery: { mediaIds: ids(fd, "galleryMediaIds").slice(0, 80) }, hero: { ...c.hero, mediaIds: ids(fd, "heroMediaIds").slice(0, 6) } }));
}

export async function saveDesignAction(_: ActionState, fd: FormData) {
  const template = str(fd, "template");
  if (!TEMPLATES.includes(template as (typeof TEMPLATES)[number])) return fail("Choose a template.");
  const primary = str(fd, "primary");
  const accent = str(fd, "accent");
  if (!/^#[0-9a-fA-F]{6}$/.test(primary) || !/^#[0-9a-fA-F]{6}$/.test(accent)) return fail("Choose valid colours.");
  const locale = str(fd, "locale") === "hi" ? "hi" : "en";
  const logo = str(fd, "logoMediaId");
  return edit(fd, (c) => ({ ...c, template: template as SiteContent["template"], theme: { primary, accent }, locale, logoMediaId: logo || null }));
}

export async function saveBookingAction(_: ActionState, fd: FormData) {
  const mode = str(fd, "mode") === "request" ? "request" : "enquiry";
  return edit(fd, (c) => ({ ...c, booking: { mode, showPrices: bool(fd, "showPrices") } }));
}

export async function saveSeoAction(_: ActionState, fd: FormData) {
  return edit(fd, (c) => ({ ...c, seo: { title: str(fd, "title", 70), description: str(fd, "description", 170), ogMediaId: str(fd, "ogMediaId") || null } }));
}

export async function saveLegalAction(_: ActionState, fd: FormData) {
  const gstin = str(fd, "gstin").toUpperCase();
  if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) return fail("A GSTIN has 15 letters and digits.");
  const grievanceEmail = str(fd, "grievanceEmail").toLowerCase();
  if (grievanceEmail && !z.email().safeParse(grievanceEmail).success) return fail("Enter a valid email for privacy requests.");
  const businessName = str(fd, "businessName", 120);
  if (!businessName) return fail("Enter the business name responsible for guest data.");
  return edit(fd, (c) => ({ ...c, legal: { businessName, gstin, grievanceEmail } }));
}

/** Alt text and deletion for library photos. Deleted photos are removed from the draft too. */
export async function photoAction(_: ActionState, fd: FormData) {
  const ctx = await requireHotel("manager");
  const id = str(fd, "id");
  const db = await getDb();
  const where = and(eq(schema.media.id, id), eq(schema.media.hotelId, ctx.hotel.id));
  if (str(fd, "op") === "delete") {
    // Soft delete: a published version may still reference the file until the next publish.
    await db.update(schema.media).set({ deletedAt: new Date() }).where(where);
    await audit(ctx.hotel.id, userActor(ctx.user), "media.deleted", {}, { target: id });
    return edit(fd, (c) => {
      const drop = (arr: string[]) => arr.filter((x) => x !== id);
      return {
        ...c,
        hero: { ...c.hero, mediaIds: drop(c.hero.mediaIds) },
        gallery: { mediaIds: drop(c.gallery.mediaIds) },
        dining: { ...c.dining, mediaIds: drop(c.dining.mediaIds) },
        rooms: c.rooms.map((r) => ({ ...r, mediaIds: drop(r.mediaIds) })),
        logoMediaId: c.logoMediaId === id ? null : c.logoMediaId,
        seo: { ...c.seo, ogMediaId: c.seo.ogMediaId === id ? null : c.seo.ogMediaId },
      };
    }, "Photo deleted.");
  }
  await db.update(schema.media).set({ alt: str(fd, "alt", 200) }).where(where);
  revalidatePath("/dashboard/website/photos");
  return ok("Description saved.");
}
