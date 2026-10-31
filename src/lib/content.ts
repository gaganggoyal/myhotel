import { z } from "zod";
import { CANCELLATION_PRESETS, PET_PRESETS, STANDARD_POLICIES, WHY_DIRECT } from "./policies";

// The structured hotel content model. Every template renders from this one shape, the
// dashboard edits it section by section, and publishing freezes a copy of it.

export const TEMPLATES = ["heritage", "coastal", "modern"] as const;
export type TemplateKey = (typeof TEMPLATES)[number];

export const PROPERTY_TYPES = ["hotel", "resort", "guest_house", "homestay", "lodge", "boutique_hotel", "villa"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  hotel: "Hotel",
  resort: "Resort",
  guest_house: "Guest house",
  homestay: "Homestay",
  lodge: "Lodge",
  boutique_hotel: "Boutique hotel",
  villa: "Villa / cottage",
};

const str = (max: number) => z.string().trim().max(max).default("");
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #7c2d12");
const ids = (max: number) => z.array(z.string().min(1).max(64)).max(max).default([]);

export const roomSchema = z.object({
  id: z.string().min(1).max(40),
  slug: z.string().min(1).max(80),
  name: z.string().trim().min(2, "Room name is required").max(80),
  summary: str(200),
  description: str(3000),
  bedType: str(60),
  maxAdults: z.number().int().min(1).max(20).default(2),
  maxChildren: z.number().int().min(0).max(10).default(1),
  sizeSqft: z.number().int().min(0).max(20000).nullable().default(null),
  view: str(60),
  amenities: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
  /** "From" price in paise per night. Labelled as a guide, never as a live rate. */
  fromPrice: z.number().int().min(0).max(100_000_000).nullable().default(null),
  mediaIds: ids(20),
  visible: z.boolean().default(true),
});
export type Room = z.infer<typeof roomSchema>;

export const propertySchema = z.object({
  name: z.string().trim().min(2, "Property name is required").max(80),
  type: z.enum(PROPERTY_TYPES).default("hotel"),
  tagline: str(120),
  description: str(4000),
  /** One line on why guests should enquire directly. */
  whyDirect: str(160),
  /** Highlight keys from the catalog in amenities.ts, in the owner's order. */
  highlights: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  /** A few lines in the owner's own words, quoted as-is in the generated description. */
  ownWords: str(600),
});

export const contactSchema = z.object({
  phone: str(20),
  whatsapp: str(20),
  email: z.union([z.literal(""), z.email("Enter a valid email")]).default(""),
  address: z
    .object({
      line1: str(120),
      line2: str(120),
      locality: str(80),
      city: str(60),
      state: str(60),
      postalCode: str(10),
      country: z.string().trim().max(60).default("India"),
    })
    .default({ line1: "", line2: "", locality: "", city: "", state: "", postalCode: "", country: "India" }),
  /** What we search for on Google Maps, e.g. "River View Retreat, Tapovan, Rishikesh". */
  mapQuery: str(200),
  directions: str(1500),
});

export const heroSchema = z.object({
  headline: str(90),
  subheadline: str(200),
  mediaIds: ids(6),
});

export const policiesSchema = z.object({
  checkIn: z.string().regex(/^\d{2}:\d{2}$/).default("12:00"),
  checkOut: z.string().regex(/^\d{2}:\d{2}$/).default("11:00"),
  cancellation: str(2000),
  payment: str(1500),
  children: str(800),
  pets: str(500),
  smoking: str(500),
  idProof: str(800),
  houseRules: str(2000),
  /** Shown before the guest sends an enquiry: say how taxes are treated. */
  taxNote: str(300),
});

export const sectionsSchema = z.object({
  gallery: z.boolean().default(true),
  dining: z.boolean().default(false),
  nearby: z.boolean().default(false),
  faq: z.boolean().default(false),
  offers: z.boolean().default(false),
  testimonials: z.boolean().default(false),
});

export const siteContentSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  locale: z.enum(["en", "hi"]).default("en"),
  template: z.enum(TEMPLATES).default("heritage"),
  theme: z.object({ primary: hex.default("#7c2d12"), accent: hex.default("#b45309") }).default({ primary: "#7c2d12", accent: "#b45309" }),
  logoMediaId: z.string().nullable().default(null),
  property: propertySchema,
  contact: contactSchema.default(contactSchema.parse({})),
  hero: heroSchema.default({ headline: "", subheadline: "", mediaIds: [] }),
  rooms: z.array(roomSchema).max(50).default([]),
  amenities: z.array(z.string().trim().min(1).max(60)).max(80).default([]),
  policies: policiesSchema.default(policiesSchema.parse({})),
  sections: sectionsSchema.default(sectionsSchema.parse({})),
  about: z.object({ title: str(80), body: str(5000) }).default({ title: "", body: "" }),
  dining: z.object({ title: str(80), body: str(3000), mediaIds: ids(12) }).default({ title: "", body: "", mediaIds: [] }),
  gallery: z.object({ mediaIds: ids(80) }).default({ mediaIds: [] }),
  nearby: z
    .array(z.object({ name: z.string().trim().min(1).max(80), distance: str(40), note: str(200) }))
    .max(20)
    .default([]),
  faq: z
    .array(z.object({ q: z.string().trim().min(1).max(200), a: z.string().trim().min(1).max(1500) }))
    .max(30)
    .default([]),
  offers: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        title: z.string().trim().min(1).max(100),
        body: str(1000),
        code: str(30),
        validUntil: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default(""),
      }),
    )
    .max(10)
    .default([]),
  testimonials: z
    .array(z.object({ quote: z.string().trim().min(1).max(600), author: z.string().trim().min(1).max(80), source: str(60) }))
    .max(12)
    .default([]),
  booking: z
    .object({
      /** enquiry: guest asks; request: guest requests specific dates + room, hotel confirms. */
      mode: z.enum(["enquiry", "request"]).default("enquiry"),
      showPrices: z.boolean().default(true),
    })
    .default({ mode: "enquiry", showPrices: true }),
  seo: z.object({ title: str(70), description: str(170), ogMediaId: z.string().nullable().default(null) }).default({ title: "", description: "", ogMediaId: null }),
  legal: z
    .object({
      /** Legal entity responsible for guest data (the data fiduciary). */
      businessName: str(120),
      gstin: z.union([z.literal(""), z.string().trim().regex(/^[0-9A-Z]{15}$/, "GSTIN has 15 characters")]).default(""),
      grievanceEmail: z.union([z.literal(""), z.email()]).default(""),
    })
    .default({ businessName: "", gstin: "", grievanceEmail: "" }),
  /**
   * Field path -> fingerprint of the text quick setup wrote there. A field whose text still
   * matches can be rewritten; once the owner edits it, it is theirs (see autowrite.ts).
   */
  autofill: z.record(z.string().max(80), z.string().max(16)).default({}),
});

export type SiteContent = z.infer<typeof siteContentSchema>;
export type SiteSections = SiteContent["sections"];

/** Parses stored JSON, filling defaults for fields added after the content was saved. */
export function parseContent(raw: unknown): SiteContent {
  return siteContentSchema.parse(raw);
}

export function slugifyRoom(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "room";
  let slug = base;
  let n = 2;
  while (taken.includes(slug)) slug = `${base}-${n++}`;
  return slug;
}

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

const DEFAULT_POLICIES = {
  checkIn: "12:00",
  checkOut: "11:00",
  cancellation: CANCELLATION_PRESETS.moderate.en,
  payment: STANDARD_POLICIES.payment.en,
  children: STANDARD_POLICIES.children.en,
  pets: PET_PRESETS.not_allowed.en,
  smoking: STANDARD_POLICIES.smoking.en,
  idProof: STANDARD_POLICIES.idProof.en,
  houseRules: STANDARD_POLICIES.houseRules.en,
  taxNote: STANDARD_POLICIES.taxNote.en,
};

/** The facts a new property starts with. autoWrite() (autowrite.ts) then writes its text. */
export function defaultContent(input: {
  name: string;
  type: PropertyType;
  city: string;
  state: string;
  phone: string;
  email: string;
}): SiteContent {
  return parseContent({
    property: {
      name: input.name,
      type: input.type,
      tagline: "",
      description: "",
      whyDirect: WHY_DIRECT.en,
    },
    contact: {
      phone: input.phone,
      whatsapp: input.phone,
      email: input.email,
      address: { line1: "", line2: "", locality: "", city: input.city, state: input.state, postalCode: "", country: "India" },
      mapQuery: "",
      directions: "",
    },
    hero: { headline: "", subheadline: "", mediaIds: [] },
    policies: DEFAULT_POLICIES,
    about: { title: "", body: "" },
    seo: { title: "", description: "", ogMediaId: null },
    legal: { businessName: "", gstin: "", grievanceEmail: input.email },
  });
}

/** Removes a photo from every place the content uses it. */
export function dropMedia(c: SiteContent, id: string): SiteContent {
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
}

/** Everything a site must have before it can be published, and softer warnings. */
export function publishChecklist(c: SiteContent, hasPhotos: boolean): { blocking: string[]; warnings: string[] } {
  const blocking: string[] = [];
  const warnings: string[] = [];
  if (!c.property.name) blocking.push("Add your property name.");
  if (!c.contact.phone && !c.contact.whatsapp) blocking.push("Add a phone or WhatsApp number guests can reach.");
  if (!c.contact.address.city) blocking.push("Add your city in Contact & location.");
  if (!c.rooms.some((r) => r.visible)) blocking.push("Add at least one visible room type.");
  if (!c.policies.cancellation) blocking.push("Write your cancellation policy.");
  if (!c.legal.businessName) blocking.push("Add the business name responsible for guest data (Settings → Legal).");
  if (!hasPhotos) warnings.push("Upload real photos of your property. Guests distrust stock images.");
  if (!c.hero.mediaIds.length) warnings.push("Choose a cover photo for the home page.");
  if (!c.property.description) warnings.push("Write a short description of your property.");
  if (!c.contact.address.line1) warnings.push("Add your street address so guests and Google can find you.");
  if (c.rooms.some((r) => r.visible && !r.mediaIds.length)) warnings.push("Some rooms have no photos.");
  if (!c.policies.taxNote) warnings.push("Say how taxes are charged before guests enquire.");
  return { blocking, warnings };
}
