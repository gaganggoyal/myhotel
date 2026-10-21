"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { EnquiryStatus, ReservationStatus } from "@/db/schema";
import { bool, fail, int, ok, str, type ActionState } from "@/lib/action";
import { userActor } from "@/lib/audit";
import { requireHotel } from "@/lib/auth";
import { BookingError, createPaymentRequest, createReservation, ENQUIRY_STATUS_LABELS, resolvePayment, setReservationStatus, updateEnquiry } from "@/lib/bookings";
import { parseRupeesToPaise } from "@/lib/format";

const reservationSchema = z.object({
  guestName: z.string().trim().min(2, "Guest name is required.").max(80),
  guestEmail: z.email("Enter the guest's email so they receive confirmations."),
  guestPhone: z.string().trim().min(8, "Enter the guest's phone.").max(20),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a check-in date."),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a check-out date."),
  adults: z.number().int().min(1).max(50),
  children: z.number().int().min(0).max(20),
  roomName: z.string().trim().min(1, "Enter the room.").max(120),
});

/** Runs a booking operation, turning expected business errors into a form message. */
async function guard<T>(fn: () => Promise<T>): Promise<{ value: T; error?: undefined } | { error: ActionState }> {
  try {
    return { value: await fn() };
  } catch (err) {
    if (err instanceof BookingError) return { error: fail(err.message) };
    throw err;
  }
}

export async function createReservationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireHotel();
  const parsed = reservationSchema.safeParse({
    guestName: str(fd, "guestName"),
    guestEmail: str(fd, "guestEmail").toLowerCase(),
    guestPhone: str(fd, "guestPhone"),
    checkIn: str(fd, "checkIn"),
    checkOut: str(fd, "checkOut"),
    adults: int(fd, "adults", 2),
    children: int(fd, "children", 0),
    roomName: str(fd, "roomName"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const total = parseRupeesToPaise(str(fd, "total"));
  if (total == null || total <= 0) return fail("Enter the total amount for the stay in rupees.");
  const status = str(fd, "status") === "confirmed" ? "confirmed" : "pending";
  const result = await guard(() =>
    createReservation(ctx.hotel, { ...parsed.data, totalAmount: total, notes: str(fd, "notes", 2000), status, notifyGuest: bool(fd, "notify") }, userActor(ctx.user), str(fd, "enquiryId") || null),
  );
  if (result.error) return result.error;
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/reservations/${result.value.id}`);
}

export async function enquiryUpdateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireHotel();
  const status = str(fd, "status") as EnquiryStatus;
  const patch: { status?: EnquiryStatus; ownerNotes?: string } = {};
  if (status) {
    if (!(status in ENQUIRY_STATUS_LABELS)) return fail("Unknown status.");
    patch.status = status;
  }
  if (fd.has("ownerNotes")) patch.ownerNotes = str(fd, "ownerNotes", 4000);
  const r = await guard(() => updateEnquiry(ctx.hotel.id, str(fd, "id"), patch, userActor(ctx.user)));
  if (r.error) return r.error;
  revalidatePath("/dashboard", "layout");
  return ok("Saved.");
}

export async function reservationStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireHotel();
  const status = str(fd, "status") as ReservationStatus;
  if (!["pending", "confirmed", "cancelled", "completed"].includes(status)) return fail("Unknown status.");
  const r = await guard(() => setReservationStatus(ctx.hotel.id, str(fd, "id"), status, userActor(ctx.user), bool(fd, "notify")));
  if (r.error) return r.error;
  revalidatePath("/dashboard", "layout");
  return ok(status === "confirmed" ? "Confirmed." : status === "cancelled" ? "Cancelled." : "Updated.");
}

export async function requestPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireHotel();
  const amount = parseRupeesToPaise(str(fd, "amount"));
  if (amount == null || amount <= 0) return fail("Enter the amount in rupees.");
  const purposeRaw = str(fd, "purpose");
  const purpose = purposeRaw === "balance" ? "balance" : purposeRaw === "full" ? "full" : "deposit";
  const r = await guard(() => createPaymentRequest(ctx.hotel, str(fd, "reservationId"), { amount, purpose, dueDays: int(fd, "dueDays", 3), notifyGuest: bool(fd, "notify") }, userActor(ctx.user)));
  if (r.error) return r.error;
  revalidatePath("/dashboard", "layout");
  return ok(bool(fd, "notify") ? "Payment request emailed to the guest. You can also share the link on WhatsApp." : "Payment link created. Share it with the guest.", { url: r.value.url });
}

export async function resolvePaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireHotel();
  const to = str(fd, "to") as "paid" | "needs_review" | "rejected" | "cancelled";
  if (!["paid", "needs_review", "rejected", "cancelled"].includes(to)) return fail("Unknown action.");
  if (to === "paid" && !bool(fd, "confirmSeen")) return fail("Tick the box to confirm you have seen this amount in your bank or UPI app.");
  const note = str(fd, "note", 500);
  if ((to === "needs_review" || to === "rejected") && !note) return fail("Add a short note for the guest explaining what you couldn’t find.");
  const r = await guard(() => resolvePayment(ctx.hotel.id, str(fd, "id"), to, { note, notifyGuest: bool(fd, "notify") }, userActor(ctx.user)));
  if (r.error) return r.error;
  revalidatePath("/dashboard", "layout");
  return ok(to === "paid" ? "Marked as received." : "Updated.");
}
