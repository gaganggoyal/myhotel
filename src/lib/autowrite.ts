import { AMENITIES, amenityLabel, amenityPhrase, BED_TYPES, findLabel, highlightFor, ROOM_VIEWS, type Highlight } from "./amenities";
import type { PropertyType, Room, SiteContent } from "./content";
import { formatINR } from "./format";
import { CANCELLATION_PRESETS, PET_PRESETS, presetOf, STANDARD_POLICIES, WHY_DIRECT, type Locale } from "./policies";

// Writes a hotel website's text from the facts an owner gives in quick setup: type, city,
// highlights, rooms, amenities and policies. It writes in the site's language and fills only
// fields that are empty or still hold text it wrote earlier (tracked in `content.autofill`
// by fingerprint), so anything the owner has edited is left alone.

const TYPE_WORD: Record<PropertyType, Record<Locale, string>> = {
  hotel: { en: "hotel", hi: "होटल" },
  resort: { en: "resort", hi: "रिज़ॉर्ट" },
  guest_house: { en: "guest house", hi: "गेस्ट हाउस" },
  homestay: { en: "homestay", hi: "होमस्टे" },
  lodge: { en: "lodge", hi: "लॉज" },
  boutique_hotel: { en: "boutique hotel", hi: "बुटीक होटल" },
  villa: { en: "villa", hi: "विला" },
};

/** FNV-1a: a short, stable fingerprint of text we wrote (not a security hash). */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function list(items: string[], locale: Locale): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${locale === "hi" ? "और" : "and"} ${items[items.length - 1]}`;
}

/** Lower-cases a label for use mid-sentence, keeping acronyms such as "TV" or "EV charging". */
function lowerFirst(s: string): string {
  return /^[A-Z][A-Z]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Cuts text to fit a field, at a word boundary. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

/** "14:00" -> "2 pm" for English copy; Hindi copy keeps the 24-hour time. */
function time(hhmm: string, locale: Locale): string {
  if (locale === "hi") return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
}

/** "a peaceful homestay by the river in Rishikesh" / "ऋषिकेश में नदी के किनारे एक शांत होमस्टे". */
function stayPhrase(type: PropertyType, character: Highlight | undefined, setting: Highlight | undefined, where: string, locale: Locale): string {
  const noun = TYPE_WORD[type][locale];
  const word = character?.word?.[locale];
  if (locale === "hi") {
    const place = setting?.place ? setting.place.hi.replace("{city}", where || "शहर") : where ? `${where} में` : "";
    return [place, "एक", word, noun].filter(Boolean).join(" ");
  }
  const place = setting?.place ? setting.place.en.replace("{city}", where || "town") : where ? `in ${where}` : "";
  const head = [word, noun].filter(Boolean).join(" ");
  return `${/^[aeiou]/i.test(head) ? "an" : "a"} ${head}${place ? ` ${place}` : ""}`;
}

function roomCopy(room: Room, locale: Locale): { summary: string; description: string } {
  const bed = findLabel(BED_TYPES, room.bedType);
  const view = findLabel(ROOM_VIEWS, room.view);
  const bedText = bed ? bed[locale] : room.bedType;
  const viewText = view ? view[locale] : room.view;
  const features = room.amenities.map((a) => amenityLabel(a, locale));
  const n = room.maxAdults;
  if (locale === "hi") {
    const summary = [bedText, `${n} मेहमान`, viewText, ...features.slice(0, 2)].filter(Boolean).join(" · ");
    const description = [
      `${room.name} में ${bedText ? `${bedText} है और इसमें` : "इसमें"} ${n} मेहमान ठहर सकते हैं।`,
      features.length ? `कमरे में ${list(features, "hi")} की सुविधा है।` : "",
      view ? `कमरे से ${view.hi} मिलता है।` : viewText ? `${viewText}।` : "",
      room.sizeSqft ? `कमरा लगभग ${room.sizeSqft} वर्ग फ़ुट का है।` : "",
    ];
    return { summary: clip(summary, 200), description: clip(description.filter(Boolean).join(" "), 3000) };
  }
  const summary = [bedText, `Sleeps ${n}`, viewText, ...features.slice(0, 2)].filter(Boolean).join(" · ");
  const has = bed ? `has ${bed.inline} and sleeps` : bedText ? `has ${lowerFirst(bedText)} and sleeps` : "sleeps";
  const description = [
    `The ${room.name} ${has} up to ${n} ${n === 1 ? "guest" : "guests"}.`,
    features.length ? `It comes with ${list(room.amenities.map(amenityPhrase), "en")}.` : "",
    view ? `Enjoy the ${lowerFirst(view.en)} from the room.` : viewText ? `${capitalise(viewText)}.` : "",
    room.sizeSqft ? `The room is about ${room.sizeSqft} sq ft.` : "",
  ];
  return { summary: clip(summary, 200), description: clip(description.filter(Boolean).join(" "), 3000) };
}

/** Policies that are empty or still a preset text follow the site's language. */
function localisePolicies(c: SiteContent, locale: Locale): void {
  const p = c.policies;
  const cancel = presetOf(CANCELLATION_PRESETS, p.cancellation) ?? (p.cancellation.trim() ? null : "moderate");
  if (cancel) p.cancellation = CANCELLATION_PRESETS[cancel][locale];
  const pets = presetOf(PET_PRESETS, p.pets) ?? (p.pets.trim() ? null : "not_allowed");
  if (pets) p.pets = PET_PRESETS[pets][locale];
  for (const key of Object.keys(STANDARD_POLICIES) as (keyof typeof STANDARD_POLICIES)[]) {
    const preset = STANDARD_POLICIES[key];
    if (!p[key].trim() || p[key] === preset.en || p[key] === preset.hi) p[key] = preset[locale];
  }
}

type Faq = { q: string; a: string };

function faqFor(c: SiteContent, locale: Locale): Faq[] {
  const has = (k: string) => c.amenities.includes(k);
  const hi = locale === "hi";
  const ci = time(c.policies.checkIn, locale);
  const co = time(c.policies.checkOut, locale);
  const out: Faq[] = [];
  out.push(
    hi
      ? { q: "चेक-इन और चेक-आउट का समय क्या है?", a: `चेक-इन ${ci} बजे से और चेक-आउट ${co} बजे तक है। उपलब्धता के अनुसार जल्दी चेक-इन या देर से चेक-आउट का इंतज़ाम किया जा सकता है।` }
      : { q: "What are the check-in and check-out times?", a: `Check-in is from ${ci} and check-out is until ${co}. Early check-in or late check-out can be arranged on request, subject to availability.` },
  );
  const request = c.booking.mode === "request";
  out.push(
    hi
      ? {
          q: "बुकिंग कैसे करें?",
          a: request
            ? "अपना कमरा और तारीख़ें चुनकर बुकिंग अनुरोध भेजें। हम उपलब्धता जाँचकर किराया बताएँगे; अग्रिम राशि मिलने पर आपकी बुकिंग पक्की हो जाती है।"
            : "इस वेबसाइट पर पूछताछ भेजें, या हमें कॉल या WhatsApp करें। हम उपलब्धता और किराया बताएँगे; अग्रिम राशि मिलने पर आपकी बुकिंग पक्की हो जाती है।",
        }
      : {
          q: "How do I book?",
          a: request
            ? "Choose your room and dates and send a booking request. We check availability and reply with a quote. Your booking is confirmed once we receive the deposit."
            : "Send us an enquiry on this website, or call or WhatsApp us. We reply with availability and a quote. Your booking is confirmed once we receive the deposit.",
        },
  );
  if (has("parking")) out.push(hi ? { q: "क्या पार्किंग उपलब्ध है?", a: "हाँ, यहाँ पार्किंग उपलब्ध है।" } : { q: "Is parking available?", a: "Yes, parking is available at the property." });
  const homeFood = c.property.highlights.includes("home_food");
  if (has("restaurant") || has("breakfast") || has("pure_veg") || homeFood) {
    const first = has("restaurant")
      ? hi ? "हाँ, यहाँ हमारा रेस्टोरेंट है।" : "Yes, we have a restaurant on site."
      : has("breakfast")
        ? hi ? "हाँ, नाश्ता उपलब्ध है।" : "Yes, breakfast is available."
        : hi ? "हाँ, अनुरोध पर घर जैसा खाना बनाया जाता है।" : "Yes, home-cooked meals are available on request.";
    const veg = has("pure_veg") ? (hi ? " हमारी रसोई शुद्ध शाकाहारी है।" : " Our kitchen is pure vegetarian.") : "";
    out.push({ q: hi ? "क्या खाना मिलता है?" : "Do you serve food?", a: first + veg });
  }
  if (has("wifi")) out.push(hi ? { q: "क्या वाई-फ़ाई है?", a: "हाँ, मुफ़्त वाई-फ़ाई उपलब्ध है।" } : { q: "Is there Wi-Fi?", a: "Yes, free Wi-Fi is available." });
  if (has("airport_transfer") || has("station_transfer")) {
    const from = [has("airport_transfer") && (hi ? "हवाई अड्डे" : "the airport"), has("station_transfer") && (hi ? "रेलवे स्टेशन" : "the railway station")].filter(Boolean) as string[];
    out.push(
      hi
        ? { q: "क्या आप पिकअप की व्यवस्था करते हैं?", a: `हाँ, हम ${list(from, "hi")} से सशुल्क पिकअप की व्यवस्था कर सकते हैं। पूछताछ करते समय अपने पहुँचने का समय बताएँ।` }
        : { q: "Can you arrange a pickup?", a: `Yes, we can arrange a paid pickup from ${list(from, "en")}. Tell us your arrival time when you enquire.` },
    );
  }
  for (const n of c.nearby.filter((x) => x.distance).slice(0, 2)) {
    out.push(hi ? { q: `${n.name} कितनी दूर है?`, a: `${n.name}, ${c.property.name} से ${n.distance} दूर है।` } : { q: `How far is ${n.name}?`, a: `${n.name} is ${n.distance} from ${c.property.name}.` });
  }
  if (c.policies.pets) out.push({ q: hi ? "क्या पालतू जानवर ला सकते हैं?" : "Are pets allowed?", a: c.policies.pets });
  if (c.policies.idProof) out.push({ q: hi ? "चेक-इन के समय कौन सा पहचान पत्र चाहिए?" : "What ID do I need at check-in?", a: c.policies.idProof });
  if (c.policies.cancellation) out.push({ q: hi ? "बुकिंग रद्द करने की नीति क्या है?" : "What is your cancellation policy?", a: c.policies.cancellation });
  return out.map((f) => ({ q: clip(f.q, 200), a: clip(f.a, 1500) }));
}

function diningCopy(c: SiteContent, locale: Locale): { title: string; body: string } {
  const has = (k: string) => c.amenities.includes(k);
  const hi = locale === "hi";
  const lines = [
    has("restaurant") && (hi ? "हमारे रेस्टोरेंट में दिन भर ताज़ा खाना मिलता है।" : "Our restaurant serves freshly cooked meals through the day."),
    has("breakfast") && (hi ? "हर सुबह नाश्ता उपलब्ध है।" : "Breakfast is available every morning."),
    c.property.highlights.includes("home_food") && (hi ? "अनुरोध पर ताज़ी, स्थानीय चीज़ों से घर जैसा खाना बनाया जाता है।" : "Home-cooked meals are made on request with fresh, local ingredients."),
    has("pure_veg") && (hi ? "हमारी रसोई शुद्ध शाकाहारी है।" : "Our kitchen is pure vegetarian."),
  ].filter(Boolean) as string[];
  if (!lines.length) return { title: "", body: "" };
  lines.push(hi ? "खाने से जुड़ी कोई ख़ास ज़रूरत हो तो पूछताछ करते समय बताएँ।" : "Tell us about any dietary needs when you enquire.");
  return { title: hi ? "भोजन" : "Food & dining", body: lines.join(" ") };
}

/**
 * Fills the site's text from its facts. `photoIds` are the hotel's library photos in upload
 * order; they become the gallery and, when none is chosen, the cover photo.
 */
export function autoWrite(input: SiteContent, photoIds: string[] = []): SiteContent {
  const c = structuredClone(input);
  const L = c.locale;
  const hi = L === "hi";
  const af = c.autofill;
  const known = new Set([WHY_DIRECT.en, WHY_DIRECT.hi]);
  /** Writes `next` when the field is empty or still holds text we wrote; returns whether it did. */
  const put = (key: string, current: string, next: string, apply: (v: string) => void): boolean => {
    if (current.trim() && af[key] !== fingerprint(current) && !known.has(current)) return false;
    apply(next);
    if (next) af[key] = fingerprint(next);
    else delete af[key];
    return true;
  };

  localisePolicies(c, L);

  const name = c.property.name;
  const addr = c.contact.address;
  const city = addr.city.trim();
  const highlights = c.property.highlights.map(highlightFor).filter((h): h is Highlight => Boolean(h));
  const character = highlights.find((h) => h.kind === "character");
  const setting = highlights.find((h) => h.kind === "setting");
  const audiences = highlights.filter((h) => h.kind === "audience");
  const extras = highlights.filter((h) => h !== character && h !== setting && h.kind !== "audience").slice(0, 4);
  const rooms = c.rooms.filter((r) => r.visible);
  const prices = rooms.map((r) => r.fromPrice).filter((p): p is number => p != null && p > 0);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const amenities = AMENITIES.filter((a) => c.amenities.includes(a.key)).slice(0, 6);
  const where = Array.from(new Set([addr.locality.trim(), city, hi ? "" : addr.state.trim()].filter(Boolean))).join(", ");

  // Rooms first: the description and SEO text below read their names and prices.
  for (const room of c.rooms) {
    const bed = findLabel(BED_TYPES, room.bedType);
    if (bed) room.bedType = bed[L];
    const view = findLabel(ROOM_VIEWS, room.view);
    if (view) room.view = view[L];
    const copy = roomCopy(room, L);
    put(`room.${room.id}.summary`, room.summary, copy.summary, (v) => (room.summary = v));
    put(`room.${room.id}.description`, room.description, copy.description, (v) => (room.description = v));
  }
  for (const key of Object.keys(af)) {
    const id = key.match(/^room\.([^.]+)\./)?.[1];
    if (id && !c.rooms.some((r) => r.id === id)) delete af[key];
  }

  const tagline = hi ? stayPhrase(c.property.type, character, setting, city, L) : capitalise(stayPhrase(c.property.type, character, setting, city, L));
  put("property.tagline", c.property.tagline, clip(tagline, 120), (v) => (c.property.tagline = v));

  const paragraphs = hi
    ? [
        [
          `${name} ${stayPhrase(c.property.type, character, setting, where, L)} है।`,
          audiences.length ? `यह जगह ${list(audiences.map((a) => a.noun.hi), L)} के लिए अच्छी है।` : "",
          extras.length ? `यहाँ की ख़ास बातें: ${list(extras.map((e) => e.noun.hi), L)}।` : "",
        ],
        [c.property.ownWords.trim()],
        [
          rooms.length === 1 ? `हमारे पास एक तरह का कमरा है, ${rooms[0].name}, जिसमें ${rooms[0].maxAdults} मेहमान ठहर सकते हैं।` : rooms.length ? `हमारे पास ${rooms.length} तरह के कमरे हैं: ${list(rooms.map((r) => r.name), L)}।` : "",
          rooms.length && minPrice ? `किराया ${formatINR(minPrice)} प्रति रात से शुरू होता है।` : "",
        ],
        [amenities.length ? `सुविधाएँ: ${list(amenities.map((a) => a.hi), L)}।` : ""],
        [`चेक-इन ${time(c.policies.checkIn, L)} बजे से और चेक-आउट ${time(c.policies.checkOut, L)} बजे तक है। उपलब्धता और सबसे अच्छी सीधी दर के लिए हमें कॉल या WhatsApp करें, या पूछताछ भेजें।`],
      ]
    : [
        [
          `${name} is ${stayPhrase(c.property.type, character, setting, where, L)}.`,
          audiences.length ? `It is a good choice for ${list(audiences.map((a) => a.noun.en), L)}.` : "",
          extras.length ? `Guests enjoy ${list(extras.map((e) => e.noun.en), L)}.` : "",
        ],
        [c.property.ownWords.trim()],
        [
          rooms.length === 1 ? `We have one room type, the ${rooms[0].name}, for up to ${rooms[0].maxAdults} ${rooms[0].maxAdults === 1 ? "guest" : "guests"}.` : rooms.length ? `Choose from ${rooms.length} room types: ${list(rooms.map((r) => r.name), L)}.` : "",
          rooms.length && minPrice ? `Rooms start from ${formatINR(minPrice)} a night.` : "",
        ],
        [amenities.length ? `Facilities include ${list(amenities.map((a) => amenityPhrase(a.key)), L)}.` : ""],
        [`Check-in is from ${time(c.policies.checkIn, L)} and check-out is until ${time(c.policies.checkOut, L)}. Call or WhatsApp us, or send an enquiry, and we will reply with availability and our best direct rate.`],
      ];
  const description = paragraphs
    .map((p) => p.filter(Boolean).join(" "))
    .filter(Boolean)
    .join("\n\n");
  put("property.description", c.property.description, clip(description, 4000), (v) => (c.property.description = v));

  put("property.whyDirect", c.property.whyDirect, WHY_DIRECT[L], (v) => (c.property.whyDirect = v));
  put("hero.headline", c.hero.headline, name, (v) => (c.hero.headline = v));
  put("about.title", c.about.title, clip(hi ? `${name} के बारे में` : `About ${name}`, 80), (v) => (c.about.title = v));
  put("legal.businessName", c.legal.businessName, name, (v) => (c.legal.businessName = v));
  const mapQuery = [name, addr.locality, city, addr.state].map((s) => s.trim()).filter(Boolean).join(", ");
  put("contact.mapQuery", c.contact.mapQuery, clip(mapQuery, 200), (v) => (c.contact.mapQuery = v));

  const typeWord = TYPE_WORD[c.property.type][L];
  const seoTitle = hi ? `${name} – ${city} में ${typeWord}` : `${name} – ${capitalise(typeWord)} in ${city}`;
  put("seo.title", c.seo.title, clip(city ? seoTitle : name, 70), (v) => (c.seo.title = v));
  const seoDescription = hi
    ? `${tagline}।${minPrice ? ` कमरे ${formatINR(minPrice)} प्रति रात से।` : ""} फ़ोन, WhatsApp या पूछताछ से सीधे बुक करें।`
    : `${tagline}.${minPrice ? ` Rooms from ${formatINR(minPrice)} a night.` : ""} Book direct by phone, WhatsApp or enquiry.`;
  put("seo.description", c.seo.description, clip(seoDescription, 170), (v) => (c.seo.description = v));

  const dining = diningCopy(c, L);
  put("dining.title", c.dining.title, dining.title, (v) => (c.dining.title = v));
  if (put("dining.body", c.dining.body, dining.body, (v) => (c.dining.body = v))) c.sections.dining = Boolean(c.dining.body);

  const faq = faqFor(c, L);
  if (put("faq", c.faq.length ? JSON.stringify(c.faq) : "", JSON.stringify(faq), (v) => (c.faq = JSON.parse(v) as Faq[]))) c.sections.faq = c.faq.length > 0;

  if (photoIds.length) {
    if (!c.hero.mediaIds.length) c.hero.mediaIds = [photoIds[0]];
    const cover = c.hero.mediaIds[0];
    const ordered = [cover, ...photoIds.filter((id) => id !== cover)].slice(0, 80);
    if (put("gallery", c.gallery.mediaIds.length ? JSON.stringify(c.gallery.mediaIds) : "", JSON.stringify(ordered), (v) => (c.gallery.mediaIds = JSON.parse(v) as string[]))) c.sections.gallery = true;
  }
  if (!c.seo.ogMediaId && c.hero.mediaIds[0]) c.seo.ogMediaId = c.hero.mediaIds[0];

  return c;
}
