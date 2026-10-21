import { ActionForm } from "@/components/forms";
import { Card, Checkbox, Field, Input, PageHeader, Select } from "@/components/ui";
import { requireHotel } from "@/lib/auth";
import { getDraft } from "@/lib/hotel";
import { createReservationAction } from "../actions";

export default async function NewReservation() {
  const { hotel } = await requireHotel();
  const { content } = await getDraft(hotel.id);
  return (
    <>
      <PageHeader title="Add a reservation" description="For bookings taken by phone, WhatsApp or walk-in, so payments and guest emails are tracked in one place." />
      <Card>
        <ActionForm action={createReservationAction} submitLabel="Create reservation">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Guest name" htmlFor="guestName">
              <Input id="guestName" name="guestName" required />
            </Field>
            <Field label="Email" htmlFor="guestEmail">
              <Input id="guestEmail" name="guestEmail" type="email" required />
            </Field>
            <Field label="Phone" htmlFor="guestPhone">
              <Input id="guestPhone" name="guestPhone" type="tel" required />
            </Field>
            <Field label="Check-in" htmlFor="checkIn">
              <Input id="checkIn" name="checkIn" type="date" required />
            </Field>
            <Field label="Check-out" htmlFor="checkOut">
              <Input id="checkOut" name="checkOut" type="date" required />
            </Field>
            <Field label="Room" htmlFor="roomName">
              <Input id="roomName" name="roomName" list="room-names" defaultValue={content.rooms[0]?.name ?? ""} required />
              <datalist id="room-names">
                {content.rooms.map((r) => (
                  <option key={r.id} value={r.name} />
                ))}
              </datalist>
            </Field>
            <Field label="Adults" htmlFor="adults">
              <Input id="adults" name="adults" type="number" min={1} defaultValue={2} />
            </Field>
            <Field label="Children" htmlFor="children">
              <Input id="children" name="children" type="number" min={0} defaultValue={0} />
            </Field>
            <Field label="Total for the stay (₹)" htmlFor="total">
              <Input id="total" name="total" inputMode="decimal" required />
            </Field>
            <Field label="Status" htmlFor="status">
              <Select id="status" name="status" defaultValue="pending">
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
    </>
  );
}
