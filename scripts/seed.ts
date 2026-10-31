// Seeds a platform admin, a demo owner and a fully published demo hotel, so the product
// can be explored immediately: river-view-retreat.<ROOT_DOMAIN>. Safe to re-run.
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import sharp from "sharp";
import { getDb, schema } from "../src/db";
import { activateManually } from "../src/lib/billing/subscription";
import { newId, parseContent, type SiteContent } from "../src/lib/content";
import { hashPassword, makeRef, randomToken } from "../src/lib/crypto";
import { todayIST } from "../src/lib/format";
import { createHotel, publishDraft, updateDraft } from "../src/lib/hotel";
import { savePhoto, saveQr } from "../src/lib/media";

const ADMIN = { email: "admin@example.com", password: "admin-password-123", name: "Platform Admin" };
const OWNER = { email: "owner@example.com", password: "owner-password-123", name: "Ravi Negi", phone: "+91 98100 00000" };
const SLUG = "river-view-retreat";

type Palette = { sky: [string, string]; hills: [string, string, string]; water: string; sun: string };
const PALETTES: Palette[] = [
  { sky: ["#fde68a", "#fb923c"], hills: ["#65a30d", "#3f6212", "#1a2e05"], water: "#0e7490", sun: "#fff7ed" },
  { sky: ["#bae6fd", "#e0f2fe"], hills: ["#4d7c0f", "#365314", "#14532d"], water: "#0369a1", sun: "#fefce8" },
  { sky: ["#c4b5fd", "#fbcfe8"], hills: ["#6d28d9", "#4c1d95", "#2e1065"], water: "#1e3a8a", sun: "#fdf4ff" },
  { sky: ["#fecaca", "#fde68a"], hills: ["#b45309", "#78350f", "#451a03"], water: "#155e75", sun: "#fffbeb" },
];

function landscape(p: Palette, label: string, seed: number): string {
  const r = (n: number) => ((Math.sin(seed * 999 + n) + 1) / 2) * 120;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.sky[1]}"/></linearGradient></defs>
<rect width="1600" height="1000" fill="url(#s)"/>
<circle cx="${1100 + r(1)}" cy="${230 + r(2) / 2}" r="90" fill="${p.sun}" opacity="0.9"/>
<path d="M0 520 L${180 + r(3)} 300 L${420 + r(4)} 470 L${700 + r(5)} 260 L${1000 + r(6)} 480 L${1280 + r(7)} 290 L1600 450 L1600 1000 L0 1000Z" fill="${p.hills[0]}" opacity="0.75"/>
<path d="M0 640 L${260 + r(8)} 470 L${560 + r(9)} 600 L${880 + r(10)} 430 L${1200 + r(11)} 610 L1600 480 L1600 1000 L0 1000Z" fill="${p.hills[1]}"/>
<path d="M0 760 C 400 700, 700 820, 1000 760 S 1400 700, 1600 760 L1600 1000 L0 1000Z" fill="${p.water}"/>
<path d="M0 880 C 300 840, 600 900, 900 860 S 1300 830, 1600 880 L1600 1000 L0 1000Z" fill="${p.hills[2]}"/>
<g fill="${p.hills[2]}">${Array.from({ length: 9 }, (_, i) => `<path d="M${80 + i * 180 + r(i + 20) / 3} 880 l28 -110 l28 110z"/>`).join("")}</g>
<text x="800" y="60" text-anchor="middle" font-family="Helvetica, Arial" font-size="30" fill="#ffffff" opacity="0.9">${label} · sample image</text></svg>`;
}

function room(wall: string, bed: string, label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100">
<rect width="1600" height="1100" fill="${wall}"/><rect y="760" width="1600" height="340" fill="#a16207" opacity="0.55"/>
<rect x="980" y="140" width="460" height="420" rx="8" fill="#bae6fd"/><path d="M980 470 L1110 330 L1250 450 L1440 300 L1440 560 L980 560Z" fill="#4d7c0f"/>
<rect x="970" y="130" width="480" height="440" rx="10" fill="none" stroke="#f8fafc" stroke-width="22"/>
<rect x="160" y="420" width="700" height="90" rx="20" fill="#78350f"/><rect x="180" y="500" width="760" height="220" rx="26" fill="${bed}"/>
<rect x="220" y="455" width="190" height="80" rx="30" fill="#ffffff"/><rect x="440" y="455" width="190" height="80" rx="30" fill="#ffffff"/>
<rect x="180" y="610" width="760" height="110" rx="20" fill="#ffffff" opacity="0.35"/><rect x="1040" y="640" width="160" height="120" rx="10" fill="#92400e"/>
<circle cx="1120" cy="600" r="44" fill="#fde68a"/><text x="800" y="60" text-anchor="middle" font-family="Helvetica, Arial" font-size="30" fill="#334155">${label} · sample image</text></svg>`;
}

async function svgPhoto(hotelId: string, userId: string, svg: string, alt: string) {
  const png = await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
  return savePhoto({ hotelId, userId, file: png, kind: "photo", alt });
}

async function main() {
  const db = await getDb();

  const people: { email: string; password: string; name: string; phone: string | null; admin: boolean }[] = [
    { ...ADMIN, phone: null, admin: true },
    { ...OWNER, admin: false },
  ];
  for (const u of people) {
    const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, u.email));
    if (!existing) {
      await db.insert(schema.users).values({
        email: u.email,
        name: u.name,
        phone: u.phone,
        passwordHash: await hashPassword(u.password),
        emailVerifiedAt: new Date(),
        isPlatformAdmin: u.admin,
      });
    }
  }
  const [owner] = await db.select().from(schema.users).where(eq(schema.users.email, OWNER.email));

  const [existingHotel] = await db.select().from(schema.hotels).where(eq(schema.hotels.slug, SLUG));
  if (existingHotel) {
    console.log(`Demo hotel already exists (${SLUG}). Nothing to do.`);
    printLogins();
    process.exit(0);
  }

  const hotel = await createHotel({ userId: owner.id, name: "River View Retreat", slug: SLUG, type: "boutique_hotel", city: "Rishikesh", state: "Uttarakhand", phone: OWNER.phone, email: OWNER.email });

  const hero = await svgPhoto(hotel.id, owner.id, landscape(PALETTES[0], "Sunrise over the Ganga", 1), "Sunrise over the Ganga from the River View Retreat terrace");
  const g1 = await svgPhoto(hotel.id, owner.id, landscape(PALETTES[1], "Morning in the garden", 2), "The garden lawn with hills behind");
  const g2 = await svgPhoto(hotel.id, owner.id, landscape(PALETTES[2], "Evening aarti light", 3), "Dusk over the river during evening aarti");
  const g3 = await svgPhoto(hotel.id, owner.id, landscape(PALETTES[3], "Rooftop café", 4), "View from the rooftop café");
  const deluxe = await svgPhoto(hotel.id, owner.id, room("#e7e5e4", "#b45309", "Deluxe River View Room"), "Deluxe River View Room with king bed and river-facing window");
  const cottage = await svgPhoto(hotel.id, owner.id, room("#ecfccb", "#4d7c0f", "Garden Cottage"), "Garden Cottage with queen bed and garden view");
  const family = await svgPhoto(hotel.id, owner.id, room("#e0f2fe", "#0e7490", "Family Suite"), "Family Suite with king bed and sofa bed");

  const rooms: SiteContent["rooms"] = [
    { id: newId(), slug: "deluxe-river-view-room", name: "Deluxe River View Room", summary: "Our most-loved room, with a private balcony facing the Ganga.", description: "Wake up to the sound of the river. Each Deluxe room has a king bed, a private balcony with two chairs, a rain shower and a writing desk.\n\nHot water and Wi-Fi run 24 hours, and the room is a 10-minute walk from Laxman Jhula.", bedType: "1 king bed", maxAdults: 2, maxChildren: 1, sizeSqft: 280, view: "River view", amenities: ["air_conditioning", "wifi", "hot_water", "tv", "kettle", "Private balcony"], fromPrice: 4_800_00, mediaIds: [deluxe.id, hero.id], visible: true },
    { id: newId(), slug: "garden-cottage", name: "Garden Cottage", summary: "A quiet standalone cottage set in our mango garden.", description: "Ideal for longer stays and yoga retreats. A queen bed, a small sit-out on the lawn, and plenty of birdsong.", bedType: "1 queen bed", maxAdults: 2, maxChildren: 1, sizeSqft: 240, view: "Garden view", amenities: ["room_heater", "wifi", "hot_water", "kettle"], fromPrice: 3_500_00, mediaIds: [cottage.id, g1.id], visible: true },
    { id: newId(), slug: "family-suite", name: "Family Suite", summary: "Two connected rooms for families of up to five.", description: "A king room connected to a twin room with a sofa bed, two bathrooms and a shared sitting area.", bedType: "1 king + 2 single beds", maxAdults: 4, maxChildren: 2, sizeSqft: 520, view: "Partial river view", amenities: ["air_conditioning", "wifi", "hot_water", "tv", "kettle"], fromPrice: 7_900_00, mediaIds: [family.id, g3.id], visible: true },
  ];

  await updateDraft(hotel.id, owner.id, (c) =>
    parseContent({
      ...c,
      template: "heritage",
      theme: { primary: "#7c2d12", accent: "#b45309" },
      property: {
        name: "River View Retreat",
        type: "boutique_hotel",
        tagline: "Riverside rooms in Tapovan, 10 minutes from Laxman Jhula",
        description:
          "River View Retreat is a family-run boutique hotel on the banks of the Ganga in Tapovan, Rishikesh. Twelve rooms look over the river or our mango garden, and the rooftop café serves home-style vegetarian food all day.\n\nWe are a short walk from Laxman Jhula, the cafés of Tapovan and the start of the Neer Garh waterfall trail, yet far enough from the road for quiet nights.",
        whyDirect: "Book direct for our best available rate, free early check-in when available, and a personal reply from the family.",
        highlights: ["river", "family_run", "peaceful", "home_food", "family", "adventure"],
        ownWords: "",
      },
      contact: {
        phone: OWNER.phone,
        whatsapp: OWNER.phone,
        email: "stay@riverviewretreat.example",
        address: { line1: "Badrinath Road, near Tapovan Sarai", line2: "", locality: "Tapovan", city: "Rishikesh", state: "Uttarakhand", postalCode: "249192", country: "India" },
        mapQuery: "Tapovan, Rishikesh, Uttarakhand 249192",
        directions: "Rishikesh railway station (Yog Nagari) is 9 km away, about 30 minutes by taxi. Jolly Grant airport, Dehradun is 35 km away.\n\nFrom Laxman Jhula, walk 10 minutes up Badrinath Road. Free parking is available for 8 cars.",
      },
      hero: { headline: "Wake up to the Ganga", subheadline: "Riverside rooms, a rooftop café and quiet nights in Tapovan, Rishikesh.", mediaIds: [hero.id] },
      rooms,
      amenities: ["wifi", "parking", "hot_water", "power_backup", "front_desk_24h", "restaurant", "pure_veg", "breakfast", "terrace", "yoga", "garden", "bonfire", "travel_desk", "doctor_on_call", "station_transfer", "laundry"],
      gallery: { mediaIds: [hero.id, g1.id, g2.id, g3.id, deluxe.id, cottage.id] },
      sections: { gallery: true, dining: true, nearby: true, faq: true, offers: true, testimonials: true },
      dining: { title: "Rooftop Café", body: "Home-style vegetarian Garhwali and North Indian food from 7 am to 10 pm, with river views from every table. Breakfast is ₹350 per person; tell us about allergies and we will cook for you.", mediaIds: [g3.id] },
      nearby: [
        { name: "Laxman Jhula", distance: "800 m", note: "10-minute walk" },
        { name: "Neer Garh waterfall", distance: "4 km", note: "Easy trail, best in the morning" },
        { name: "Triveni Ghat", distance: "6 km", note: "Evening Ganga aarti at sunset" },
        { name: "Rishikesh railway station", distance: "9 km", note: "30 minutes by taxi" },
      ],
      faq: [
        { q: "Is early check-in possible?", a: "Yes, free from 9 am when the room is ready. Tell us your arrival time and we will try our best." },
        { q: "Do you arrange river rafting?", a: "Our travel desk books rafting with licensed operators. Pickup is from the hotel gate." },
        { q: "Is the food vegetarian?", a: "Yes. Rishikesh is a vegetarian town and our kitchen is pure vegetarian. Eggs are not served." },
      ],
      offers: [{ id: newId(), title: "Stay 4 nights, pay for 3 (Mon–Thu)", body: "Valid on Garden Cottages for weekday stays from July to September.", code: "MONSOON4", validUntil: "2027-09-30" }],
      testimonials: [
        { quote: "Spotless rooms, warm family hosts and the best view of the Ganga we found in Rishikesh.", author: "Priya S.", source: "Google review" },
        { quote: "The rooftop café alone is worth the stay. Quiet at night even in peak season.", author: "Daniel K.", source: "TripAdvisor" },
      ],
      booking: { mode: "request", showPrices: true },
      seo: { title: "River View Retreat, Rishikesh – Riverside boutique hotel in Tapovan", description: "Family-run boutique hotel on the Ganga in Tapovan, Rishikesh. River-view rooms, rooftop vegetarian café, 10 minutes from Laxman Jhula. Book direct.", ogMediaId: null },
      legal: { businessName: "River View Hospitality (Prop. Ravi Negi)", gstin: "", grievanceEmail: "stay@riverviewretreat.example" },
    }),
  );

  await publishDraft(hotel, { userId: owner.id, label: owner.email }, "Launch");
  await activateManually(hotel.id, "yearly", "simulated");

  // A real, scannable UPI QR for the demo payee (the demo VPA does not exist).
  const vpa = "riverview@okaxis";
  const qrPng = await QRCode.toBuffer(`upi://pay?pa=${vpa}&pn=RIVER%20VIEW%20HOSPITALITY&cu=INR`, { width: 600, margin: 4 });
  const { row: qr, decoded } = await saveQr({ hotelId: hotel.id, userId: owner.id, file: qrPng });
  const [pm] = await db
    .insert(schema.paymentMethods)
    .values({ hotelId: hotel.id, scheme: "upi", payeeName: "RIVER VIEW HOSPITALITY", vpa, qrMediaId: qr.id, qrDecoded: decoded, note: "Please add your booking reference in the payment note.", attestedAt: new Date(), attestedBy: owner.id })
    .returning();

  // Sample leads, a reservation with a reported payment, and 30 days of analytics.
  const day = (offset: number) => new Date(Date.parse(`${todayIST()}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
  const guests = [
    { n: "Ananya Sharma", e: "ananya@example.com", p: "+91 98765 43210", kind: "booking_request" as const, status: "new" as const, ci: 12, co: 15, room: rooms[0], msg: "We arrive by the evening train. Is early check-in possible?" },
    { n: "Rohit Verma", e: "rohit@example.com", p: "+91 99887 76655", kind: "enquiry" as const, status: "contacted" as const, ci: 30, co: 32, room: rooms[2], msg: "Family of 4 with two kids (6 and 9). Do you have a cot?" },
    { n: "Meera Iyer", e: "meera@example.com", p: "+91 90000 11111", kind: "booking_request" as const, status: "won" as const, ci: 5, co: 8, room: rooms[1], msg: "Yoga retreat, prefer a quiet room." },
  ];
  for (const [i, g] of guests.entries()) {
    const [enq] = await db
      .insert(schema.enquiries)
      .values({ hotelId: hotel.id, ref: makeRef("RVR"), kind: g.kind, status: g.status, guestName: g.n, guestEmail: g.e, guestPhone: g.p, checkIn: day(g.ci), checkOut: day(g.co), adults: 2, children: i === 1 ? 2 : 0, roomId: g.room.id, roomName: g.room.name, message: g.msg, source: { path: "/enquire", utm: i === 0 ? { utm_source: "instagram" } : undefined }, createdAt: new Date(Date.now() - (i + 1) * 3 * 3600_000) })
      .returning();
    if (g.status === "won") {
      const [res] = await db
        .insert(schema.reservations)
        .values({ hotelId: hotel.id, ref: makeRef("RVR"), enquiryId: enq.id, status: "pending", guestName: g.n, guestEmail: g.e, guestPhone: g.p, checkIn: enq.checkIn!, checkOut: enq.checkOut!, adults: 2, children: 0, roomName: g.room.name, totalAmount: 3 * 3_500_00, createdBy: owner.id })
        .returning();
      await db.update(schema.enquiries).set({ reservationId: res.id }).where(eq(schema.enquiries.id, enq.id));
      await db.insert(schema.reservationEvents).values({ hotelId: hotel.id, reservationId: res.id, type: "created", actorUserId: owner.id, actorLabel: owner.email });
      await db.insert(schema.paymentRequests).values({
        hotelId: hotel.id,
        reservationId: res.id,
        token: randomToken(24),
        amount: 3_000_00,
        purpose: "deposit",
        status: "guest_reported",
        payee: { payeeName: pm.payeeName, vpa: pm.vpa, qrMediaId: pm.qrMediaId, note: pm.note },
        expiresAt: new Date(Date.now() + 3 * 86_400_000),
        guestReportedAt: new Date(Date.now() - 3600_000),
        guestUtr: "432198765012",
        guestNote: "Paid from Google Pay",
        createdBy: owner.id,
      });
      await db.insert(schema.reservationEvents).values({ hotelId: hotel.id, reservationId: res.id, type: "payment.guest_reported", actorLabel: "guest" });
    }
  }

  const paths = ["/", "/", "/", "/rooms", "/rooms/deluxe-river-view-room", "/rooms/garden-cottage", "/location", "/gallery", "/policies", "/enquire"];
  const ctas = ["whatsapp_sticky", "enquire_hero", "call_sticky", "directions", "enquire_room", "whatsapp_hero"];
  const refs = ["www.google.com", "www.instagram.com", "l.facebook.com", null, null];
  const events: (typeof schema.analyticsEvents.$inferInsert)[] = [];
  for (let d = 29; d >= 0; d--) {
    const views = 15 + Math.round(12 * Math.abs(Math.sin(d / 3))) + (d % 7 === 5 || d % 7 === 6 ? 10 : 0);
    for (let v = 0; v < views; v++) {
      events.push({ hotelId: hotel.id, type: "page_view", path: paths[(v + d) % paths.length], referrer: refs[(v * 3 + d) % refs.length], device: v % 4 === 0 ? "desktop" : "mobile", visitorHash: `seed-${d}-${Math.floor(v / 2)}`, utmSource: v % 9 === 0 ? "instagram" : null, day: day(-d) });
    }
    for (let c = 0; c < Math.round(views / 5); c++) events.push({ hotelId: hotel.id, type: "cta_click", path: "/", cta: ctas[(c + d) % ctas.length], day: day(-d) });
    if (d % 4 === 0) events.push({ hotelId: hotel.id, type: d % 8 === 0 ? "booking_request" : "enquiry", path: "/enquire", day: day(-d) });
  }
  for (let i = 0; i < events.length; i += 200) await db.insert(schema.analyticsEvents).values(events.slice(i, i + 200));

  console.log(`Seeded demo hotel "${hotel.name}".`);
  printLogins();
  process.exit(0);
}

function printLogins() {
  const root = process.env.ROOT_DOMAIN ?? "localhost:3000";
  const proto = process.env.APP_PROTOCOL ?? "http";
  console.log(`
  Platform:   ${proto}://${root}
  Demo site:  ${proto}://${SLUG}.${root}
  Owner:      ${OWNER.email} / ${OWNER.password}
  Admin:      ${ADMIN.email} / ${ADMIN.password}
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
