import { ActionForm } from "@/components/forms";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { INDIAN_STATES } from "@/lib/india";
import { saveContactAction } from "../actions";
import { loadEditor, Revision } from "../shared";

export default async function ContactEditor() {
  const { content: c, revision } = await loadEditor();
  const a = c.contact.address;
  return (
    <>
      <PageHeader title="Contact & location" description="Use exactly the same name, address and phone as your Google Business Profile, so Google and guests see one consistent listing." />
      <ActionForm action={saveContactAction}>
        <Revision value={revision} />
        <Card title="How guests reach you">
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Phone" htmlFor="phone">
              <Input id="phone" name="phone" type="tel" defaultValue={c.contact.phone} />
            </Field>
            <Field label="WhatsApp" htmlFor="whatsapp" hint="Indian 10-digit numbers get +91 automatically.">
              <Input id="whatsapp" name="whatsapp" type="tel" defaultValue={c.contact.whatsapp} />
            </Field>
            <Field label="Public email" htmlFor="email">
              <Input id="email" name="email" type="email" defaultValue={c.contact.email} />
            </Field>
          </div>
        </Card>
        <Card title="Address">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Address line 1" htmlFor="line1" className="sm:col-span-2">
              <Input id="line1" name="line1" defaultValue={a.line1} />
            </Field>
            <Field label="Address line 2" htmlFor="line2">
              <Input id="line2" name="line2" defaultValue={a.line2} />
            </Field>
            <Field label="Area / locality" htmlFor="locality">
              <Input id="locality" name="locality" defaultValue={a.locality} />
            </Field>
            <Field label="City / town" htmlFor="city">
              <Input id="city" name="city" defaultValue={a.city} required />
            </Field>
            <Field label="State" htmlFor="state">
              <Select id="state" name="state" defaultValue={a.state}>
                <option value="">Select…</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="PIN code" htmlFor="postalCode">
              <Input id="postalCode" name="postalCode" defaultValue={a.postalCode} inputMode="numeric" maxLength={10} />
            </Field>
            <Field label="Country" htmlFor="country">
              <Input id="country" name="country" defaultValue={a.country} />
            </Field>
          </div>
        </Card>
        <Card title="Map and directions">
          <div className="space-y-5">
            <Field label="Map search text" htmlFor="mapQuery" hint="What Google Maps should search for. Your property name plus town usually finds your pin.">
              <Input id="mapQuery" name="mapQuery" defaultValue={c.contact.mapQuery} />
            </Field>
            <Field label="How to reach us" htmlFor="directions" hint="Nearest railway station, airport, bus stand, parking, last-mile tips.">
              <Textarea id="directions" name="directions" defaultValue={c.contact.directions} rows={5} />
            </Field>
          </div>
        </Card>
      </ActionForm>
    </>
  );
}
