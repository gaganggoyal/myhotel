import { z } from "zod";
import { getDb, schema } from "@/db";
import { createEnquiry } from "@/lib/bookings";
import { config } from "@/lib/config";
import { hashIp, verifyTimestamp } from "@/lib/crypto";
import { formatDate, nightsBetween, todayIST, whatsappLink } from "@/lib/format";
import { json, sameOrigin, siteForRequest, verifyTurnstile } from "@/lib/public-api";
import { rateLimit } from "@/lib/ratelimit";
import { ipFromHeaders } from "@/lib/request";

const date = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional();

const bodySchema = z.object({
  kind: z.enum(["enquiry", "booking_request"]),
  guestName: z.string().trim().min(2, "Please enter your name.").max(80),
  guestEmail: z.email("Please enter a valid email address.").max(120),
  guestPhone: z
    .string()
    .trim()
    .min(8, "Please enter a phone number we can reach you on.")
    .max(20)
    .regex(/^[+()\d\s-]+$/, "Please enter a valid phone number."),
  checkIn: date,
  checkOut: date,
  adults: z.coerce.number().int().min(1).max(20),
  children: z.coerce.number().int().min(0).max(10).default(0),
  roomId: z.string().max(40).optional(),
  message: z.string().trim().max(2000).optional().default(""),
  marketingConsent: z.boolean().optional().default(false),
  website: z.string().optional(),
  t: z.string().max(80),
  path: z.string().max(200).optional(),
  referrer: z.string().max(300).optional(),
  utm: z.record(z.string(), z.string().max(100)).optional(),
  "cf-turnstile-response": z.string().optional(),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false, error: "Forbidden" }, 403);
  const site = await siteForRequest(req);
  if (!site) return json({ ok: false, error: "This website is not accepting enquiries right now." }, 404);

  const raw = await req.text();
  if (raw.length > 20_000) return json({ ok: false, error: "Message too long." }, 413);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }
  const parsed = bodySchema.safeParse(parsedJson);
  if (!parsed.success) return json({ ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." }, 400);
  const body = parsed.data;

  // Honeypot filled: answer like a success so bots learn nothing.
  if (body.website) return json({ ok: true, ref: "RECEIVED", whatsappUrl: null });
  if (!verifyTimestamp(body.t)) return json({ ok: false, error: "Please reload the page and try again." }, 400);

  const ip = ipFromHeaders(req.headers);
  if (!(await verifyTurnstile(body["cf-turnstile-response"], ip, config.turnstile.secretKey))) {
    return json({ ok: false, error: "Please complete the verification and try again." }, 400);
  }
  const hotelId = site.hotel.id;
  const allowed = (await rateLimit(`enq:${hotelId}:${hashIp(ip)}`, 5, 600)) && (await rateLimit(`enq:${hotelId}`, 300, 86_400));
  if (!allowed) return json({ ok: false, error: "Too many requests. Please call or WhatsApp us instead." }, 429);

  const content = site.content;
  const kind = content.booking.mode === "request" ? body.kind : "enquiry";
  const checkIn = body.checkIn || null;
  const checkOut = body.checkOut || null;
  if (kind === "booking_request" && (!checkIn || !checkOut)) return json({ ok: false, error: "Please choose your check-in and check-out dates." }, 400);
  if (checkIn && checkOut) {
    if (checkOut <= checkIn) return json({ ok: false, error: "Check-out must be after check-in." }, 400);
    if (checkIn < todayIST()) return json({ ok: false, error: "Check-in cannot be in the past." }, 400);
    if (nightsBetween(checkIn, checkOut) > 60) return json({ ok: false, error: "For stays longer than 60 nights, please call us." }, 400);
    if (nightsBetween(todayIST(), checkIn) > 730) return json({ ok: false, error: "We take enquiries up to two years ahead." }, 400);
  }

  const enquiry = await createEnquiry(site.hotel, content, {
    kind,
    guestName: body.guestName,
    guestEmail: body.guestEmail,
    guestPhone: body.guestPhone,
    checkIn,
    checkOut,
    adults: body.adults,
    children: body.children,
    roomId: body.roomId || null,
    message: body.message,
    marketingConsent: body.marketingConsent,
    source: { path: body.path, referrer: body.referrer?.slice(0, 200), utm: body.utm },
  });

  const db = await getDb();
  await db.insert(schema.analyticsEvents).values({
    hotelId,
    type: kind === "booking_request" ? "booking_request" : "enquiry",
    path: (body.path ?? "/").slice(0, 200),
    utmSource: body.utm?.utm_source ?? null,
    utmMedium: body.utm?.utm_medium ?? null,
    utmCampaign: body.utm?.utm_campaign ?? null,
    day: todayIST(),
  });

  const dates = checkIn && checkOut ? ` for ${formatDate(checkIn)} – ${formatDate(checkOut)}` : "";
  const whatsappUrl = whatsappLink(
    content.contact.whatsapp || content.contact.phone,
    `Hello ${content.property.name}, I just sent ${kind === "booking_request" ? "a booking request" : "an enquiry"} (ref ${enquiry.ref})${dates}, ${body.adults} adult(s)${body.children ? ` + ${body.children} child(ren)` : ""}. My name is ${body.guestName}.`,
  );
  return json({ ok: true, ref: enquiry.ref, whatsappUrl });
}
