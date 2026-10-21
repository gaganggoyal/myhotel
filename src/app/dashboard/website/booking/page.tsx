import { ActionForm } from "@/components/forms";
import { Alert, Card, Checkbox, PageHeader } from "@/components/ui";
import { saveBookingAction } from "../actions";
import { loadEditor, Revision } from "../shared";

export default async function BookingEditor() {
  const { content: c, revision } = await loadEditor();
  const option = (value: "enquiry" | "request", title: string, body: string) => (
    <label className="block cursor-pointer rounded-xl border-2 border-slate-200 p-4 has-[:checked]:border-slate-900 has-[:checked]:bg-slate-50">
      <span className="flex items-center gap-2 font-semibold text-slate-900">
        <input type="radio" name="mode" value={value} defaultChecked={c.booking.mode === value} />
        {title}
      </span>
      <span className="mt-1 block text-sm text-slate-600">{body}</span>
    </label>
  );
  return (
    <>
      <PageHeader title="Booking mode" description="How guests contact you from the website." />
      <ActionForm action={saveBookingAction}>
        <Revision value={revision} />
        <Card>
          <div className="grid gap-4 md:grid-cols-2">
            {option("enquiry", "Enquiry", "Guests ask a question with optional dates. Best if you mostly quote over phone or WhatsApp.")}
            {option("request", "Request to book", "Guests choose dates, room and guests and send a booking request. You confirm availability, then send payment details.")}
          </div>
          <div className="mt-5">
            <Checkbox name="showPrices" defaultChecked={c.booking.showPrices} label="Show guide “from” prices on room pages" hint="Labelled as a guide, with your tax note. Hide them if your rates change often." />
          </div>
        </Card>
        <Alert tone="info" title="Why there is no “instant confirmation” yet">
          Your rooms are also sold on OTAs and by phone. Until a live availability calendar is connected, confirming instantly would risk selling a room twice. Both modes above are labelled honestly for guests.
        </Alert>
      </ActionForm>
    </>
  );
}
