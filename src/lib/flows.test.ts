// End-to-end service flows against a throwaway embedded Postgres (separate from .data/).
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

process.env.PGLITE_DIR = mkdtempSync(path.join(tmpdir(), "myhotel-test-"));
process.env.EMAIL_PROVIDER = "console";
const realLog = console.log;

type Mods = {
  db: typeof import("@/db");
  hotel: typeof import("./hotel");
  site: typeof import("./site");
  bookings: typeof import("./bookings");
  sub: typeof import("./billing/subscription");
  send: typeof import("./email/send");
  crypto: typeof import("./crypto");
  cache: typeof import("./site-cache");
};
let m: Mods;
let userId: string;

before(async () => {
  console.log = () => undefined; // console email provider is chatty
  m = {
    db: await import("@/db"),
    hotel: await import("./hotel"),
    site: await import("./site"),
    bookings: await import("./bookings"),
    sub: await import("./billing/subscription"),
    send: await import("./email/send"),
    crypto: await import("./crypto"),
    cache: await import("./site-cache"),
  };
  const db = await m.db.getDb();
  const [u] = await db.insert(m.db.schema.users).values({ email: "o@test.in", name: "Owner", passwordHash: await m.crypto.hashPassword("pw-1234567890"), emailVerifiedAt: new Date() }).returning();
  userId = u.id;
});

after(() => {
  console.log = realLog;
});

describe("hotel lifecycle", () => {
  it("creates, refuses incomplete publish, publishes, serves and redirects renamed slugs", async () => {
    const h = await m.hotel.createHotel({ userId, name: "Lake Stay", slug: "lake-stay", type: "homestay", city: "Nainital", state: "Uttarakhand", phone: "9800000001", email: "o@test.in" });
    await assert.rejects(() => m.hotel.createHotel({ userId, name: "Copy", slug: "lake-stay", type: "hotel", city: "x", state: "", phone: "1", email: "o@test.in" }), /taken/);

    // Unpublished: the subdomain resolves but renders the offline page.
    let r = await m.site.resolveHost("lake-stay.localhost:3000");
    assert.equal(r.type, "site");
    assert.equal(r.type === "site" && r.site.availability, "offline");

    await assert.rejects(() => m.hotel.publishDraft(h, { userId, label: "o" }), /room/);
    await m.hotel.updateDraft(h.id, userId, (c) => ({ ...c, rooms: [{ id: "r1", slug: "lake-room", name: "Lake Room", summary: "", description: "", bedType: "", maxAdults: 2, maxChildren: 0, sizeSqft: null, view: "", amenities: [], fromPrice: 250000, mediaIds: [], visible: true }] }));
    await assert.rejects(() => m.hotel.updateDraft(h.id, userId, (c) => c, 1), /Someone else saved/);
    const { version } = await m.hotel.publishDraft(h, { userId, label: "o" });
    assert.equal(version, 1);

    m.cache.invalidateHotel(h.id);
    r = await m.site.resolveHost("lake-stay.localhost:3000");
    assert.equal(r.type === "site" && r.site.availability, "live");
    assert.equal((await m.site.resolveHost("unknown-place.localhost:3000")).type, "notfound");

    const [fresh] = await (await m.db.getDb()).select().from(m.db.schema.hotels).where((await import("drizzle-orm")).eq(m.db.schema.hotels.id, h.id));
    await m.hotel.changeSlug(fresh, "lake-view-stay", { userId, label: "o" });
    const old = await m.site.resolveHost("lake-stay.localhost:3000");
    assert.deepEqual(old, { type: "redirect", host: "lake-view-stay.localhost:3000" });
    assert.equal(await m.hotel.isSlugAvailable("lake-stay"), false, "retired slugs are never reissued");
  });
});

describe("guest booking and payment", () => {
  it("runs enquiry → reservation → payment request → guest report → staff confirmation", async () => {
    const db = await m.db.getDb();
    const { eq } = await import("drizzle-orm");
    const [h] = await db.select().from(m.db.schema.hotels).where(eq(m.db.schema.hotels.slug, "lake-view-stay"));
    const { content } = await m.hotel.getDraft(h.id);

    const enquiry = await m.bookings.createEnquiry(h, content, { kind: "booking_request", guestName: "Asha", guestEmail: "asha@test.in", guestPhone: "9800000002", checkIn: "2027-01-10", checkOut: "2027-01-12", adults: 2, children: 0, roomId: "r1", message: "", marketingConsent: false, source: {} });
    assert.equal(enquiry.roomName, "Lake Room");
    const mails = await db.select().from(m.db.schema.emailMessages).where(eq(m.db.schema.emailMessages.hotelId, h.id));
    assert.deepEqual(mails.map((x) => x.templateKey).sort(), ["booking_request_guest", "enquiry_owner"]);
    const guestMail = mails.find((x) => x.templateKey === "booking_request_guest")!;
    assert.equal(guestMail.replyTo, "o@test.in", "guest replies go to the owner");
    assert.match(guestMail.fromEmail, /^"Lake Stay via MyHotel" <lake-view-stay@/);

    const res = await m.bookings.createReservation(h, { guestName: "Asha", guestEmail: "asha@test.in", guestPhone: "9800000002", checkIn: "2027-01-10", checkOut: "2027-01-12", adults: 2, children: 0, roomName: "Lake Room", totalAmount: 500000, notes: "", status: "pending", notifyGuest: false }, { userId, label: "o" }, enquiry.id);

    await assert.rejects(() => m.bookings.createPaymentRequest(h, res.id, { amount: 200000, purpose: "deposit", dueDays: 3, notifyGuest: true }, { userId, label: "o" }), /UPI/);
    await db.insert(m.db.schema.paymentMethods).values({ hotelId: h.id, payeeName: "LAKE STAY", vpa: "lake@okicici", attestedAt: new Date(), attestedBy: userId });
    const { request, url } = await m.bookings.createPaymentRequest(h, res.id, { amount: 200000, purpose: "deposit", dueDays: 3, notifyGuest: true }, { userId, label: "o" });
    assert.match(url, /^http:\/\/lake-view-stay\.localhost:3000\/pay\//);

    // Later edits to payment details never change a request already sent.
    await db.update(m.db.schema.paymentMethods).set({ vpa: "attacker@ybl" }).where(eq(m.db.schema.paymentMethods.hotelId, h.id));
    const found = await m.bookings.findPaymentRequestByToken(request.token);
    assert.equal(found?.request.payee.vpa, "lake@okicici");

    await m.bookings.guestReportPayment(request.token, { utr: "123456789012", note: "", proofMediaId: null });
    assert.equal((await m.bookings.reservationTotals(res.id)).paid, 0, "a guest report is not a payment");
    await assert.rejects(() => m.bookings.resolvePayment(h.id, request.id, "paid", { note: "", notifyGuest: false }, { userId, label: "o" }).then(() => m.bookings.resolvePayment(h.id, request.id, "paid", { note: "", notifyGuest: false }, { userId, label: "o" })), /Cannot change/);
    assert.equal((await m.bookings.reservationTotals(res.id)).paid, 200000);

    await m.bookings.setReservationStatus(h.id, res.id, "cancelled", { userId, label: "o" }, true);
    const cancelled = await db.select().from(m.db.schema.emailMessages).where(eq(m.db.schema.emailMessages.templateKey, "booking_cancelled"));
    assert.equal(cancelled.length, 1);
  });
});

describe("email reputation", () => {
  it("suppresses bounced addresses per hotel and pauses a hotel after complaints", async () => {
    const db = await m.db.getDb();
    const { eq } = await import("drizzle-orm");
    const [h] = await db.select().from(m.db.schema.hotels).where(eq(m.db.schema.hotels.slug, "lake-view-stay"));
    const sent = await db.select().from(m.db.schema.emailMessages).where(eq(m.db.schema.emailMessages.templateKey, "booking_request_guest"));
    await m.send.recordDeliveryEvent({ providerMessageId: sent[0].providerMessageId!, event: "bounced" });
    const again = await m.send.sendHotelEmail({ hotelId: h.id, key: "enquiry_guest", to: "asha@test.in", vars: { guest_name: "Asha" } });
    assert.equal(again.status, "suppressed");

    for (let i = 0; i < 3; i++) {
      const s = await m.send.sendHotelEmail({ hotelId: h.id, key: "enquiry_guest", to: `g${i}@test.in`, vars: {} });
      const [row] = await db.select().from(m.db.schema.emailMessages).where(eq(m.db.schema.emailMessages.id, s.id));
      await m.send.recordDeliveryEvent({ providerMessageId: row.providerMessageId!, event: "complained" });
    }
    const [paused] = await db.select().from(m.db.schema.hotels).where(eq(m.db.schema.hotels.id, h.id));
    assert.ok(paused.mailPausedAt, "hotel guest mail is paused");
    const blocked = await m.send.sendHotelEmail({ hotelId: h.id, key: "enquiry_guest", to: "new@test.in", vars: {} });
    assert.equal(blocked.status, "paused");
    // Owner notifications and platform mail are not blocked by a guest-stream pause.
    const owner = await m.send.sendHotelEmail({ hotelId: h.id, key: "enquiry_owner", to: "o@test.in", vars: {} });
    assert.equal(owner.status, "sent");
  });
});

describe("billing jobs", () => {
  it("suspends expired trials (site goes offline) and reactivation brings it back", async () => {
    const db = await m.db.getDb();
    const { eq } = await import("drizzle-orm");
    const [h] = await db.select().from(m.db.schema.hotels).where(eq(m.db.schema.hotels.slug, "lake-view-stay"));
    await db.update(m.db.schema.subscriptions).set({ trialEndsAt: new Date(Date.now() - 1000) }).where(eq(m.db.schema.subscriptions.hotelId, h.id));
    const stats = await m.sub.runBillingJobs();
    assert.equal(stats.trialsEnded, 1);
    m.cache.invalidateHotel(h.id);
    let r = await m.site.resolveHost("lake-view-stay.localhost:3000");
    assert.equal(r.type === "site" && r.site.availability, "offline");

    await m.sub.activateManually(h.id, "yearly", "simulated");
    m.cache.invalidateHotel(h.id);
    r = await m.site.resolveHost("lake-view-stay.localhost:3000");
    assert.equal(r.type === "site" && r.site.availability, "live");
    const s = await m.sub.getSubscription(h.id);
    assert.equal(s?.status, "active");
    assert.ok(s!.currentPeriodEnd! > new Date(Date.now() + 360 * 86_400_000));
  });
});
