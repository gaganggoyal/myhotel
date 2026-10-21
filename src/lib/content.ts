import { z } from "zod";

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
  cancellation:
    "Free cancellation up to 7 days before arrival. Cancellations within 7 days forfeit the deposit. No-shows are charged the first night.",
  payment:
    "A deposit confirms your booking. The balance is payable at check-in by UPI, card or cash. We confirm your booking once we have received the deposit in our account.",
  children: "Children up to 5 years stay free using existing bedding. An extra mattress is available on request at an additional charge.",
  pets: "Pets are not allowed unless agreed in advance.",
  smoking: "Smoking is not permitted inside rooms.",
  idProof:
    "A valid government photo ID (Aadhaar, passport, driving licence or voter ID) is required for every adult guest at check-in. Foreign nationals must present a passport and valid visa.",
  houseRules: "Quiet hours are from 10 pm to 7 am. Visitors are welcome in common areas only.",
  taxNote: "Room rates shown are a guide and exclude GST, which is charged as applicable. Your confirmed quote will show the final amount.",
};

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
      tagline: input.city ? `A ${PROPERTY_TYPE_LABELS[input.type].toLowerCase()} in ${input.city}` : "",
      description: "",
      whyDirect: "Book directly with us for the best available rate and a personal reply from our team.",
    },
    contact: {
      phone: input.phone,
      whatsapp: input.phone,
      email: input.email,
      address: { line1: "", line2: "", locality: "", city: input.city, state: input.state, postalCode: "", country: "India" },
      mapQuery: [input.name, input.city, input.state].filter(Boolean).join(", "),
      directions: "",
    },
    hero: { headline: input.name, subheadline: "", mediaIds: [] },
    policies: DEFAULT_POLICIES,
    about: { title: `About ${input.name}`, body: "" },
    seo: { title: "", description: "", ogMediaId: null },
    legal: { businessName: input.name, gstin: "", grievanceEmail: input.email },
  });
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
