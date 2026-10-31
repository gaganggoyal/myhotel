import { z } from "zod";
import { AMENITIES, BED_TYPES, findLabel, HIGHLIGHTS, isCatalogAmenity, ROOM_FEATURE_KEYS, ROOM_VIEWS } from "./amenities";
import { newId, PROPERTY_TYPES, slugifyRoom, TEMPLATES, type PropertyType, type SiteContent, type TemplateKey } from "./content";
import { parseRupeesToPaise } from "./format";
import { CANCELLATION_PRESETS, PET_PRESETS, presetOf, type CancellationPreset, type PetPreset } from "./policies";
import { TEMPLATE_STYLES } from "@/site/theme";

// Quick setup: the guided flow that turns an owner's photos and answers into a website.
// Each step validates its own answers and merges them into the draft; autowrite.ts then
// writes the text from them.

export class SetupError extends Error {}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time.");

export const placeInput = z.object({
  name: z.string().trim().min(2, "Enter your property name.").max(80),
  type: z.enum(PROPERTY_TYPES),
  highlights: z.array(z.string().max(60)).max(12, "Choose up to 12 highlights."),
  ownWords: z.string().trim().max(600, "Keep your own words under 600 characters."),
});

export const roomInput = z.object({
  id: z.string().max(40),
  name: z.string().trim().min(2, "Give every room a name.").max(80),
  /** Rupees as typed, e.g. "2,500"; empty hides the price. */
  price: z.string().trim().max(20),
  adults: z.number().int().min(1).max(20),
  bed: z.string().trim().max(60),
  view: z.string().trim().max(60),
  features: z.array(z.string().max(60)).max(30),
  mediaIds: z.array(z.string().max(64)).max(20),
});
export const roomsInput = z.object({ rooms: z.array(roomInput).min(1, "Add at least one room.").max(20, "You can add up to 20 room types.") });

export const facilitiesInput = z.object({
  amenities: z.array(z.string().max(60)).max(80),
  checkIn: time,
  checkOut: time,
  cancellation: z.enum(["flexible", "moderate", "strict", "custom"]),
  pets: z.enum(["allowed", "not_allowed", "custom"]),
});

const phone = z.string().trim().regex(/^\+?[\d\s()-]{8,20}$/, "Enter a phone number with at least 8 digits.");
export const contactInput = z.object({
  phone,
  whatsapp: z.union([z.literal(""), phone]),
  email: z.union([z.literal(""), z.email("Enter a valid email.")]),
  line1: z.string().trim().max(120),
  locality: z.string().trim().max(80),
  city: z.string().trim().min(2, "Enter your city or town.").max(60),
  state: z.string().trim().max(60),
  postalCode: z.union([z.literal(""), z.string().trim().regex(/^\d{6}$/, "A PIN code has 6 digits.")]),
  /** Rows without a name are ignored, so the form can keep a blank row. */
  nearby: z.array(z.object({ name: z.string().trim().max(80), distance: z.string().trim().max(40) })).max(6),
});

export const lookInput = z.object({ template: z.enum(TEMPLATES), locale: z.enum(["en", "hi"]) });

export type PlaceInput = z.infer<typeof placeInput>;
export type RoomInput = z.infer<typeof roomInput>;
export type FacilitiesInput = z.infer<typeof facilitiesInput>;
export type ContactInput = z.infer<typeof contactInput>;
export type LookInput = z.infer<typeof lookInput>;

export function applyPlace(c: SiteContent, input: PlaceInput): SiteContent {
  const valid = new Set(HIGHLIGHTS.map((h) => h.key));
  const highlights = Array.from(new Set(input.highlights.filter((k) => valid.has(k))));
  return { ...c, property: { ...c.property, name: input.name, type: input.type, highlights, ownWords: input.ownWords } };
}

/** Makes `id` the cover photo, keeping any other hero photos after it. */
export function applyCover(c: SiteContent, id: string): SiteContent {
  return { ...c, hero: { ...c.hero, mediaIds: [id, ...c.hero.mediaIds.filter((x) => x !== id)].slice(0, 6) } };
}

/** Replaces the room list. Existing rooms keep their URL slug and the fields setup does not ask about. */
export function applyRooms(c: SiteContent, rooms: RoomInput[], photoIds: Set<string>): SiteContent {
  const slugs = c.rooms.map((r) => r.slug);
  const next = rooms.map((input) => {
    const existing = c.rooms.find((r) => r.id === input.id);
    const fromPrice = input.price ? parseRupeesToPaise(input.price) : null;
    if (input.price && fromPrice == null) throw new SetupError(`Enter the price for ${input.name} in rupees, like 2500.`);
    const bed = BED_TYPES.find((b) => b.key === input.bed);
    const view = ROOM_VIEWS.find((v) => v.key === input.view);
    const slug = existing?.slug ?? slugifyRoom(input.name, slugs);
    slugs.push(slug);
    return {
      id: existing?.id ?? newId(),
      slug,
      name: input.name,
      summary: existing?.summary ?? "",
      description: existing?.description ?? "",
      bedType: bed ? bed[c.locale] : input.bed,
      maxAdults: input.adults,
      maxChildren: existing?.maxChildren ?? 1,
      sizeSqft: existing?.sizeSqft ?? null,
      view: view ? view[c.locale] : input.view,
      amenities: [...input.features.filter((f) => ROOM_FEATURE_KEYS.includes(f)), ...(existing?.amenities.filter((a) => !ROOM_FEATURE_KEYS.includes(a)) ?? [])],
      fromPrice,
      mediaIds: input.mediaIds.filter((id) => photoIds.has(id)),
      visible: existing?.visible ?? true,
    };
  });
  return { ...c, rooms: next };
}

export function applyFacilities(c: SiteContent, input: FacilitiesInput): SiteContent {
  const chosen = AMENITIES.filter((a) => input.amenities.includes(a.key)).map((a) => a.key);
  const custom = c.amenities.filter((a) => !isCatalogAmenity(a));
  const policies = { ...c.policies, checkIn: input.checkIn, checkOut: input.checkOut };
  if (input.cancellation !== "custom") policies.cancellation = CANCELLATION_PRESETS[input.cancellation][c.locale];
  if (input.pets !== "custom") policies.pets = PET_PRESETS[input.pets][c.locale];
  return { ...c, amenities: [...chosen, ...custom], policies };
}

export function applyContact(c: SiteContent, input: ContactInput): SiteContent {
  const nearby = input.nearby
    .filter((n) => n.name.trim())
    .map((n) => ({ name: n.name.trim(), distance: n.distance.trim(), note: c.nearby.find((x) => x.name === n.name.trim())?.note ?? "" }));
  return {
    ...c,
    contact: {
      ...c.contact,
      phone: input.phone,
      whatsapp: input.whatsapp || input.phone,
      email: input.email,
      address: { ...c.contact.address, line1: input.line1, locality: input.locality, city: input.city, state: input.state, postalCode: input.postalCode },
    },
    nearby,
    sections: { ...c.sections, nearby: nearby.length > 0 },
  };
}

/** Colours follow the template unless the owner chose their own. */
export function applyLook(c: SiteContent, input: LookInput): SiteContent {
  const isTemplateDefault = Object.values(TEMPLATE_STYLES).some((t) => t.defaults.primary === c.theme.primary && t.defaults.accent === c.theme.accent);
  return { ...c, template: input.template, locale: input.locale, theme: isTemplateDefault ? { ...TEMPLATE_STYLES[input.template].defaults } : c.theme };
}

// ---------------------------------------------------------------------------
// What the wizard shows, read back from the draft
// ---------------------------------------------------------------------------

export type WizardPhoto = { id: string; thumb: string };
export type WizardRoom = RoomInput;

export type SetupState = {
  place: PlaceInput;
  coverId: string | null;
  rooms: WizardRoom[];
  facilities: { amenities: string[]; checkIn: string; checkOut: string; cancellation: CancellationPreset | "custom"; pets: PetPreset | "custom" };
  contact: ContactInput;
  look: { template: TemplateKey; locale: "en" | "hi" };
};

function rupees(paise: number | null): string {
  return paise == null ? "" : String(Math.round(paise / 100));
}

export function wizardState(c: SiteContent): SetupState {
  const a = c.contact.address;
  return {
    place: { name: c.property.name, type: c.property.type as PropertyType, highlights: c.property.highlights, ownWords: c.property.ownWords },
    coverId: c.hero.mediaIds[0] ?? null,
    rooms: c.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      price: rupees(r.fromPrice),
      adults: r.maxAdults,
      bed: findLabel(BED_TYPES, r.bedType)?.key ?? r.bedType,
      view: findLabel(ROOM_VIEWS, r.view)?.key ?? r.view,
      features: r.amenities.filter((f) => ROOM_FEATURE_KEYS.includes(f)),
      mediaIds: r.mediaIds,
    })),
    facilities: {
      amenities: c.amenities.filter((k) => AMENITIES.some((x) => x.key === k)),
      checkIn: c.policies.checkIn,
      checkOut: c.policies.checkOut,
      cancellation: presetOf(CANCELLATION_PRESETS, c.policies.cancellation) ?? (c.policies.cancellation ? "custom" : "moderate"),
      pets: presetOf(PET_PRESETS, c.policies.pets) ?? (c.policies.pets ? "custom" : "not_allowed"),
    },
    contact: {
      phone: c.contact.phone,
      whatsapp: c.contact.whatsapp === c.contact.phone ? "" : c.contact.whatsapp,
      email: c.contact.email,
      line1: a.line1,
      locality: a.locality,
      city: a.city,
      state: a.state,
      postalCode: a.postalCode,
      nearby: c.nearby.map((n) => ({ name: n.name, distance: n.distance })),
    },
    look: { template: c.template, locale: c.locale },
  };
}
