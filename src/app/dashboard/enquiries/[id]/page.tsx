import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { ActionForm } from "@/components/forms";
import { Badge, Card, Checkbox, Field, Input, LinkButton, PageHeader, Select, Textarea } from "@/components/ui";
import { requireHotel } from "@/lib/auth";
import { ENQUIRY_STATUS_LABELS } from "@/lib/bookings";
import { formatDate, formatDateTime, nightsBetween, paiseToRupeeInput, whatsappLink } from "@/lib/format";
import { getDraft } from "@/lib/hotel";
import { createReservationAction, enquiryUpdateAction } from "../../reservations/actions";

export default async function EnquiryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hotel } = await requireHotel();
  const db = await getDb();
  const [e] = await db.select().from(schema.enquiries).where(and(eq(schema.enquiries.id, id), eq(schema.enquiries.hotelId, hotel.id)));
  if (!e || e.anonymizedAt) notFound();
  const { content } = await getDraft(hotel.id);
  const room = content.rooms.find((r) => r.id === e.roomId);
  const nights = nightsBetween(e.checkIn, e.checkOut);
  const suggestedTotal = room?.fromPrice && nights ? room.fromPrice * nights : null;
  const wa = whatsappLink(e.guestPhone, `Hello ${e.guestName}, thank you for your ${e.kind === "booking_request" ? "booking request" : "enquiry"} (${e.ref}) at ${content.property.name}. `);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/dashboard/enquiries" className="text-slate-600 hover:underline">
          ← All enquiries
        </Link>
      </p>
      <PageHeader
        title={e.guestName}
        description={`${e.kind === "booking_request" ? "Booking request" : "Enquiry"} ${e.ref} · received ${formatDateTime(e.createdAt)}`}
        actions={
          <>
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg bg-[#1f7a4d] px-4 py-2.5 text-sm font-semibold text-white">
                Reply on WhatsApp
              </a>
            ) : null}
            <a href={`mailto:${e.guestEmail}?subject=${encodeURIComponent(`Your enquiry ${e.ref} – ${content.property.name}`)}`} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800">
              Reply by email
            </a>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card title="Request">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {[
              ["Dates", e.checkIn ? `${formatDate(e.checkIn)} → ${formatDate(e.checkOut)} (${nights} night${nights === 1 ? "" : "s"})` : "Not specified"],
              ["Guests", `${e.adults} adult${e.adults === 1 ? "" : "s"}${e.children ? `, ${e.children} child${e.children === 1 ? "" : "ren"}` : ""}`],
              ["Room", e.roomName ?? "Any"],
              ["Phone", e.guestPhone],
              ["Email", e.guestEmail],
              ["Offers by email", e.marketingConsent ? "Yes, consented" : "No"],
              ["Came from", [e.source?.path, e.source?.utm?.utm_source ? `utm: ${e.source.utm.utm_source}` : "", e.source?.referrer].filter(Boolean).join(" · ") || "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-medium text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
          {e.message ? <blockquote className="mt-5 whitespace-pre-line rounded-lg bg-slate-50 p-4 text-sm text-slate-800">{e.message}</blockquote> : null}
        </Card>
        <Card title="Status and notes">
          <ActionForm action={enquiryUpdateAction} submitLabel="Save">
            <input type="hidden" name="id" value={e.id} />
            <Field label="Status" htmlFor="status">
              <Select id="status" name="status" defaultValue={e.status}>
                {Object.entries(ENQUIRY_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Private notes" htmlFor="ownerNotes">
              <Textarea id="ownerNotes" name="ownerNotes" defaultValue={e.ownerNotes ?? ""} rows={4} />
            </Field>
          </ActionForm>
        </Card>
      </div>

      <div className="mt-4">
        {e.reservationId ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                <Badge tone="good">Booked</Badge> This enquiry has a reservation.
              </p>
              <LinkButton href={`/dashboard/reservations/${e.reservationId}`}>Open reservation</LinkButton>
            </div>
          </Card>
        ) : (
          <Card title="Turn into a reservation" description="Once you have agreed dates and price with the guest. You can then send UPI payment details.">
            <ActionForm action={createReservationAction} submitLabel="Create reservation">
              <input type="hidden" name="enquiryId" value={e.id} />
              <input type="hidden" name="guestName" value={e.guestName} />
              <input type="hidden" name="guestEmail" value={e.guestEmail} />
              <input type="hidden" name="guestPhone" value={e.guestPhone} />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Check-in" htmlFor="checkIn">
                  <Input id="checkIn" name="checkIn" type="date" defaultValue={e.checkIn ?? ""} required />
                </Field>
                <Field label="Check-out" htmlFor="checkOut">
                  <Input id="checkOut" name="checkOut" type="date" defaultValue={e.checkOut ?? ""} required />
                </Field>
                <Field label="Room" htmlFor="roomName">
                  <Input id="roomName" name="roomName" defaultValue={e.roomName ?? content.rooms[0]?.name ?? ""} list="room-names" required />
                  <datalist id="room-names">
                    {content.rooms.map((r) => (
                      <option key={r.id} value={r.name} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Adults" htmlFor="adults">
                  <Input id="adults" name="adults" type="number" min={1} defaultValue={e.adults} />
                </Field>
                <Field label="Children" htmlFor="children">
                  <Input id="children" name="children" type="number" min={0} defaultValue={e.children} />
                </Field>
                <Field label="Total for the stay (₹)" htmlFor="total" hint={suggestedTotal ? "Suggested from your guide price × nights. Adjust to your quote." : "Including taxes, as quoted to the guest."}>
                  <Input id="total" name="total" inputMode="decimal" defaultValue={paiseToRupeeInput(suggestedTotal)} required />
                </Field>
                <Field label="Status" htmlFor="rstatus">
                  <Select id="rstatus" name="status" defaultValue="pending">
                    <option value="pending">Pending (awaiting deposit)</option>
                    <option value="confirmed">Confirmed</option>
                  </Select>
                </Field>
                <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
                  <Input id="notes" name="notes" />
                </Field>
              </div>
              <Checkbox name="notify" defaultChecked label="Email the guest a confirmation if the status is Confirmed" />
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
