import { ActionForm } from "@/components/forms";
import { Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { savePoliciesAction } from "../actions";
import { loadEditor, Revision } from "../shared";

export default async function PoliciesEditor() {
  const { content: c, revision } = await loadEditor();
  const p = c.policies;
  const area = (name: keyof typeof p, label: string, hint?: string, rows = 3) => (
    <Field label={label} htmlFor={name} hint={hint}>
      <Textarea id={name} name={name} defaultValue={p[name]} rows={rows} />
    </Field>
  );
  return (
    <>
      <PageHeader title="Policies" description="Shown on your Policies page and, in short, next to the enquiry form so guests see the rules before they ask. These are your terms; we don’t add legal wording for you." />
      <ActionForm action={savePoliciesAction}>
        <Revision value={revision} />
        <Card title="Times">
          <div className="grid max-w-md grid-cols-2 gap-4">
            <Field label="Check-in from" htmlFor="checkIn">
              <Input id="checkIn" name="checkIn" type="time" defaultValue={p.checkIn} required />
            </Field>
            <Field label="Check-out by" htmlFor="checkOut">
              <Input id="checkOut" name="checkOut" type="time" defaultValue={p.checkOut} required />
            </Field>
          </div>
        </Card>
        <Card title="Booking terms">
          <div className="space-y-5">
            {area("cancellation", "Cancellation policy (required)", "Be specific: how many days before arrival, and what is refunded.", 4)}
            {area("payment", "Deposits and payment", "How much deposit confirms a booking, and how the balance is paid.")}
            {area("taxNote", "Taxes", "Say clearly whether prices include GST. Late surprises are the main reason guests abandon direct bookings.", 2)}
          </div>
        </Card>
        <Card title="Stay rules">
          <div className="space-y-5">
            {area("idProof", "ID at check-in")}
            {area("children", "Children and extra beds")}
            {area("pets", "Pets", undefined, 2)}
            {area("smoking", "Smoking", undefined, 2)}
            {area("houseRules", "House rules")}
          </div>
        </Card>
      </ActionForm>
    </>
  );
}
