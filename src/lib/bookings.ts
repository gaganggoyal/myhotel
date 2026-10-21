import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { EnquiryKind, EnquiryStatus, PaymentRequestStatus, ReservationStatus } from "@/db/schema";
import { audit, GUEST_ACTOR, type AuditActor } from "./audit";
import { appUrl, siteOrigin, subdomainHost } from "./config";
import type { SiteContent } from "./content";
import { makeRef, randomToken, refPrefix } from "./crypto";
import { activeDomainFor } from "./domains/service";
import { hotelInbox, sendHotelEmail } from "./email/send";
import { formatDate, formatINR, nightsBetween } from "./format";

const { enquiries, reservations, reservationEvents, paymentRequests, paymentMethods, hotels } = schema;
type Reservation = typeof reservations.$inferSelect;
type PaymentRequest = typeof paymentRequests.$inferSelect;

export class BookingError extends Error {}

export const ENQUIRY_STATUS_LABELS: Record<EnquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  won: "Booked",
  lost: "Lost",
  spam: "Spam",
};

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
};

/** Owner-facing labels. Guest-facing wording lives on the payment page. */
export const PAYMENT_STATUS_LABELS: Record<PaymentRequestStatus, string> = {
  unpaid: "Awaiting payment",
  guest_reported: "Guest says paid – check your account",
  paid: "Received",
  needs_review: "Not matched yet",
  rejected: "Not received",
  cancelled: "Cancelled",
};

type Actor = "guest" | "staff";
const TRANSITIONS: Record<PaymentRequestStatus, Partial<Record<PaymentRequestStatus, Actor[]>>> = {
  unpaid: { guest_reported: ["guest"], paid: ["staff"], cancelled: ["staff"] },
  guest_reported: { guest_reported: ["guest"], paid: ["staff"], needs_review: ["staff"], rejected: ["staff"], cancelled: ["staff"] },
  needs_review: { guest_reported: ["guest"], paid: ["staff"], rejected: ["staff"], cancelled: ["staff"] },
  rejected: { guest_reported: ["guest"], paid: ["staff"], cancelled: ["staff"] },
  // A mistaken "received" can be reopened by staff; the audit log keeps both actions.
  paid: { needs_review: ["staff"] },
  cancelled: {},
};

/** Only staff can ever set "paid". Guest actions are reports, never settlement. */
export function canTransition(from: PaymentRequestStatus, to: PaymentRequestStatus, actor: Actor): boolean {
  return TRANSITIONS[from][to]?.includes(actor) ?? false;
}

async function uniqueRef(table: typeof enquiries | typeof reservations, prefix: string): Promise<string> {
  const db = await getDb();
  for (let i = 0; i < 8; i++) {
    const ref = makeRef(prefix);
    const [hit] = await db.select({ id: table.id }).from(table).where(eq(table.ref, ref));
    if (!hit) return ref;
  }
  return makeRef(prefix, 8);
}

function guestsLabel(adults: number, children: number): string {
  const a = `${adults} adult${adults === 1 ? "" : "s"}`;
  return children ? `${a}, ${children} child${children === 1 ? "" : "ren"}` : a;
}

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}

export async function siteBaseUrl(hotelId: string, slug: string): Promise<string> {
  const d = await activeDomainFor(hotelId);
  return siteOrigin(d?.hostname ?? subdomainHost(slug));
}

// ---------------------------------------------------------------------------
// Enquiries
// ---------------------------------------------------------------------------

export type EnquiryInput = {
  kind: EnquiryKind;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  checkIn: string | null;
  checkOut: string | null;
  adults: number;
  children: number;
  roomId: string | null;
  message: string;
  marketingConsent: boolean;
  source: { path?: string; cta?: string; referrer?: string; utm?: Record<string, string> };
};

export async function createEnquiry(hotel: { id: string; slug: string }, content: SiteContent, input: EnquiryInput) {
  const db = await getDb();
  const room = input.roomId ? content.rooms.find((r) => r.id === input.roomId && r.visible) : undefined;
  const ref = await uniqueRef(enquiries, refPrefix(hotel.slug));
  const [row] = await db
    .insert(enquiries)
    .values({
      hotelId: hotel.id,
      ref,
      kind: input.kind,
      guestName: input.guestName,
      guestEmail: input.guestEmail.toLowerCase(),
      guestPhone: input.guestPhone,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      adults: input.adults,
      children: input.children,
      roomId: room?.id ?? null,
      roomName: room?.name ?? null,
      message: input.message || null,
      marketingConsent: input.marketingConsent,
      source: input.source,
    })
    .returning();

  const vars = {
    guest_name: row.guestName,
    guest_email: row.guestEmail,
    guest_phone: row.guestPhone,
    ref,
    check_in: row.checkIn ? formatDate(row.checkIn) : "Not specified",
    check_out: row.checkOut ? formatDate(row.checkOut) : "Not specified",
    nights: row.checkIn && row.checkOut ? String(nightsBetween(row.checkIn, row.checkOut)) : undefined,
    guests: guestsLabel(row.adults, row.children),
    room_name: row.roomName ?? "Any",
    message: row.message ?? "",
    kind_label: input.kind === "booking_request" ? "booking request" : "enquiry",
    dashboard_link: appUrl(`/dashboard/enquiries/${row.id}`),
  };
  // Owner first: the lead must never be lost even if the guest's address bounces.
  await sendHotelEmail({ hotelId: hotel.id, key: "enquiry_owner", to: await hotelInbox(hotel.id), vars });
  await sendHotelEmail({ hotelId: hotel.id, key: input.kind === "booking_request" ? "booking_request_guest" : "enquiry_guest", to: row.guestEmail, vars });
  return row;
}

export async function updateEnquiry(hotelId: string, id: string, patch: { status?: EnquiryStatus; ownerNotes?: string }, actor: AuditActor) {
  const db = await getDb();
  const [row] = await db
    .update(enquiries)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(enquiries.id, id), eq(enquiries.hotelId, hotelId)))
    .returning();
  if (!row) throw new BookingError("Enquiry not found");
  if (patch.status) await audit(hotelId, actor, "enquiry.status", { ref: row.ref, status: patch.status }, { target: id });
  return row;
}

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------

async function logEvent(r: { id: string; hotelId: string }, type: string, actor: AuditActor, data?: Record<string, unknown>) {
  const db = await getDb();
  await db.insert(reservationEvents).values({ hotelId: r.hotelId, reservationId: r.id, type, actorUserId: actor.userId, actorLabel: actor.label, data: data ?? null });
}

export type ReservationInput = {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  roomName: string;
  totalAmount: number;
  notes: string;
  status: "pending" | "confirmed";
  notifyGuest: boolean;
};

export async function createReservation(hotel: { id: string; slug: string }, input: ReservationInput, actor: AuditActor, enquiryId?: string | null) {
  if (input.checkOut <= input.checkIn) throw new BookingError("Check-out must be after check-in.");
  const db = await getDb();
  const ref = await uniqueRef(reservations, refPrefix(hotel.slug));
  const [r] = await db
    .insert(reservations)
    .values({ hotelId: hotel.id, ref, enquiryId: enquiryId ?? null, createdBy: actor.userId, ...input, notes: input.notes || null })
    .returning();
  await logEvent(r, "created", actor, { status: r.status, total: r.totalAmount });
  if (enquiryId) {
    await db.update(enquiries).set({ status: "won", reservationId: r.id, updatedAt: new Date() }).where(and(eq(enquiries.id, enquiryId), eq(enquiries.hotelId, hotel.id)));
  }
  await audit(hotel.id, actor, "reservation.created", { ref }, { target: r.id });
  if (r.status === "confirmed" && input.notifyGuest) await sendConfirmation(r);
  return r;
}

export async function reservationTotals(reservationId: string): Promise<{ paid: number; requested: number }> {
  const db = await getDb();
  const rows = await db.select().from(paymentRequests).where(eq(paymentRequests.reservationId, reservationId));
  return {
    paid: rows.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0),
    requested: rows.filter((p) => !["paid", "cancelled", "rejected"].includes(p.status)).reduce((s, p) => s + p.amount, 0),
  };
}

async function stayVars(r: Reservation, content?: SiteContent) {
  const { paid } = await reservationTotals(r.id);
  return {
    guest_name: r.guestName,
    ref: r.ref,
    check_in: formatDate(r.checkIn),
    check_out: formatDate(r.checkOut),
    nights: String(nightsBetween(r.checkIn, r.checkOut)),
    guests: guestsLabel(r.adults, r.children),
    room_name: r.roomName,
    total: formatINR(r.totalAmount),
    paid: formatINR(paid),
    balance: formatINR(Math.max(0, r.totalAmount - paid)),
    check_in_time: content ? to12h(content.policies.checkIn) : undefined,
    check_out_time: content ? to12h(content.policies.checkOut) : undefined,
    cancellation_policy: content?.policies.cancellation,
  };
}

async function contentFor(hotelId: string): Promise<SiteContent | undefined> {
  const { getDraft } = await import("./hotel");
  return (await getDraft(hotelId).catch(() => null))?.content;
}

async function sendConfirmation(r: Reservation) {
  const content = await contentFor(r.hotelId);
  await sendHotelEmail({ hotelId: r.hotelId, key: "booking_confirmed", to: r.guestEmail, vars: await stayVars(r, content) });
}

export async function setReservationStatus(hotelId: string, id: string, status: ReservationStatus, actor: AuditActor, notifyGuest: boolean) {
  const db = await getDb();
  const [r] = await db.select().from(reservations).where(and(eq(reservations.id, id), eq(reservations.hotelId, hotelId)));
  if (!r) throw new BookingError("Reservation not found");
  if (r.status === status) return r;
  if (r.status === "cancelled") throw new BookingError("This reservation is cancelled.");
  const [updated] = await db.update(reservations).set({ status, updatedAt: new Date() }).where(eq(reservations.id, id)).returning();
  await logEvent(r, `status.${status}`, actor);
  await audit(hotelId, actor, "reservation.status", { ref: r.ref, status }, { target: id });
  if (status === "cancelled") {
    await db
      .update(paymentRequests)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(paymentRequests.reservationId, id), inArray(paymentRequests.status, ["unpaid", "guest_reported", "needs_review"])));
    if (notifyGuest) {
      const content = await contentFor(hotelId);
      await sendHotelEmail({ hotelId, key: "booking_cancelled", to: r.guestEmail, vars: await stayVars(updated, content) });
    }
  }
  if (status === "confirmed" && notifyGuest) await sendConfirmation(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Payment requests (hotel's own UPI; the platform is never in the money flow)
// ---------------------------------------------------------------------------

export async function getPaymentMethod(hotelId: string) {
  const db = await getDb();
  const [pm] = await db.select().from(paymentMethods).where(and(eq(paymentMethods.hotelId, hotelId), eq(paymentMethods.scheme, "upi")));
  return pm ?? null;
}

export async function createPaymentRequest(
  hotel: { id: string; slug: string },
  reservationId: string,
  input: { amount: number; purpose: "deposit" | "balance" | "full"; dueDays: number; notifyGuest: boolean },
  actor: AuditActor,
): Promise<{ request: PaymentRequest; url: string }> {
  const db = await getDb();
  const [r] = await db.select().from(reservations).where(and(eq(reservations.id, reservationId), eq(reservations.hotelId, hotel.id)));
  if (!r) throw new BookingError("Reservation not found");
  if (r.status === "cancelled") throw new BookingError("This reservation is cancelled.");
  const pm = await getPaymentMethod(hotel.id);
  if (!pm || !pm.enabled) throw new BookingError("Add your UPI payment details first (Payments page).");
  if (input.amount <= 0) throw new BookingError("Enter an amount greater than zero.");

  const expiresAt = new Date(Date.now() + Math.max(1, Math.min(60, input.dueDays)) * 86_400_000);
  const [request] = await db
    .insert(paymentRequests)
    .values({
      hotelId: hotel.id,
      reservationId: r.id,
      token: randomToken(24),
      amount: input.amount,
      purpose: input.purpose,
      payee: { payeeName: pm.payeeName, vpa: pm.vpa, qrMediaId: pm.qrMediaId, note: pm.note },
      expiresAt,
      createdBy: actor.userId,
    })
    .returning();
  const url = `${await siteBaseUrl(hotel.id, hotel.slug)}/pay/${request.token}`;
  await logEvent(r, "payment.requested", actor, { amount: input.amount, purpose: input.purpose });
  await audit(hotel.id, actor, "payment.requested", { ref: r.ref, amount: input.amount }, { target: request.id });
  if (input.notifyGuest) {
    await sendHotelEmail({
      hotelId: hotel.id,
      key: "payment_instructions",
      to: r.guestEmail,
      vars: {
        guest_name: r.guestName,
        ref: r.ref,
        amount: formatINR(input.amount),
        purpose: input.purpose === "deposit" ? "Deposit" : input.purpose === "balance" ? "Balance" : "Full payment",
        payee_name: pm.payeeName,
        upi_id: pm.vpa,
        due_date: formatDate(expiresAt),
        payment_link: url,
      },
    });
  }
  return { request, url };
}

export async function findPaymentRequestByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ request: paymentRequests, reservation: reservations, hotel: hotels })
    .from(paymentRequests)
    .innerJoin(reservations, eq(reservations.id, paymentRequests.reservationId))
    .innerJoin(hotels, eq(hotels.id, paymentRequests.hotelId))
    .where(eq(paymentRequests.token, token));
  return row ?? null;
}

/** Guest says they paid. This is a message to the hotel, never a settlement. */
export async function guestReportPayment(token: string, input: { utr: string; note: string; proofMediaId: string | null }) {
  const found = await findPaymentRequestByToken(token);
  if (!found) throw new BookingError("Payment link not found.");
  const { request, reservation } = found;
  if (!canTransition(request.status, "guest_reported", "guest")) throw new BookingError("This payment can no longer be updated. Contact the hotel.");
  const db = await getDb();
  await db
    .update(paymentRequests)
    .set({ status: "guest_reported", guestReportedAt: new Date(), guestUtr: input.utr, guestNote: input.note || null, guestProofMediaId: input.proofMediaId ?? request.guestProofMediaId, updatedAt: new Date() })
    .where(eq(paymentRequests.id, request.id));
  await logEvent(reservation, "payment.guest_reported", GUEST_ACTOR, { utr: input.utr, amount: request.amount });
  await sendHotelEmail({
    hotelId: request.hotelId,
    key: "payment_reported_owner",
    to: await hotelInbox(request.hotelId),
    vars: {
      guest_name: reservation.guestName,
      guest_email: reservation.guestEmail,
      ref: reservation.ref,
      amount: formatINR(request.amount),
      utr: input.utr,
      message: input.note,
      dashboard_link: appUrl(`/dashboard/reservations/${reservation.id}`),
    },
  });
}

export async function resolvePayment(
  hotelId: string,
  requestId: string,
  to: "paid" | "needs_review" | "rejected" | "cancelled",
  input: { note: string; notifyGuest: boolean },
  actor: AuditActor,
) {
  const db = await getDb();
  const [row] = await db
    .select({ request: paymentRequests, reservation: reservations })
    .from(paymentRequests)
    .innerJoin(reservations, eq(reservations.id, paymentRequests.reservationId))
    .where(and(eq(paymentRequests.id, requestId), eq(paymentRequests.hotelId, hotelId)));
  if (!row) throw new BookingError("Payment request not found");
  const { request, reservation } = row;
  if (!canTransition(request.status, to, "staff")) throw new BookingError(`Cannot change a payment from “${PAYMENT_STATUS_LABELS[request.status]}” to “${PAYMENT_STATUS_LABELS[to]}”.`);
  await db
    .update(paymentRequests)
    .set({ status: to, resolvedAt: new Date(), resolvedBy: actor.userId, resolutionNote: input.note || null, updatedAt: new Date() })
    .where(eq(paymentRequests.id, request.id));
  await logEvent(reservation, `payment.${to}`, actor, { amount: request.amount, note: input.note });
  await audit(hotelId, actor, `payment.${to}`, { ref: reservation.ref, amount: request.amount }, { target: request.id });

  if (!input.notifyGuest) return;
  const content = await contentFor(hotelId);
  if (to === "paid") {
    const vars = await stayVars(reservation, content);
    await sendHotelEmail({ hotelId, key: "payment_received", to: reservation.guestEmail, vars: { ...vars, amount: formatINR(request.amount) } });
  } else if (to === "needs_review" || to === "rejected") {
    await sendHotelEmail({
      hotelId,
      key: "payment_issue",
      to: reservation.guestEmail,
      vars: { guest_name: reservation.guestName, ref: reservation.ref, amount: formatINR(request.amount), utr: request.guestUtr ?? "", reason: input.note },
    });
  }
}

export async function reservationWithPayments(hotelId: string, id: string) {
  const db = await getDb();
  const [r] = await db.select().from(reservations).where(and(eq(reservations.id, id), eq(reservations.hotelId, hotelId)));
  if (!r) return null;
  const payments = await db.select().from(paymentRequests).where(eq(paymentRequests.reservationId, id)).orderBy(desc(paymentRequests.createdAt));
  const events = await db.select().from(reservationEvents).where(eq(reservationEvents.reservationId, id)).orderBy(desc(reservationEvents.createdAt));
  return { reservation: r, payments, events };
}

export async function openPaymentCount(hotelId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ id: paymentRequests.id })
    .from(paymentRequests)
    .where(and(eq(paymentRequests.hotelId, hotelId), eq(paymentRequests.status, "guest_reported")));
  return rows.length;
}

export async function newEnquiryCount(hotelId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select({ id: enquiries.id }).from(enquiries).where(and(eq(enquiries.hotelId, hotelId), eq(enquiries.status, "new")));
  return rows.length;
}
