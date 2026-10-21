import { ActionButton, ActionForm } from "@/components/forms";
import { MediaPicker } from "@/components/media";
import { Card, Checkbox, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { saveOfferAction, savePagesAction } from "../actions";
import { loadEditor, Revision } from "../shared";

export default async function PagesEditor() {
  const { content: c, revision, media } = await loadEditor();
  const s = c.sections;
  const faqText = c.faq.map((f) => `${f.q}\n${f.a}`).join("\n\n");
  const testimonialText = c.testimonials.map((t) => `${t.quote}\n— ${t.author}${t.source ? `, ${t.source}` : ""}`).join("\n\n");
  const nearbyText = c.nearby.map((n) => [n.name, n.distance, n.note].filter((x, i) => x || i === 0).join(" | ")).join("\n");
  return (
    <>
      <PageHeader title="Extra pages" description="Turn on a page only when you have something real to say. Empty pages are hidden from guests automatically." />
      <ActionForm action={savePagesAction}>
        <Revision value={revision} />
        <Card title="About">
          <div className="space-y-4">
            <Field label="Title" htmlFor="aboutTitle">
              <Input id="aboutTitle" name="aboutTitle" defaultValue={c.about.title} />
            </Field>
            <Field label="Your story" htmlFor="aboutBody" hint="Who runs the property, its history, what you care about.">
              <Textarea id="aboutBody" name="aboutBody" defaultValue={c.about.body} rows={6} />
            </Field>
          </div>
        </Card>
        <Card title="Dining" actions={<Checkbox name="s_dining" defaultChecked={s.dining} label="Show page" />}>
          <div className="space-y-4">
            <Field label="Title" htmlFor="diningTitle">
              <Input id="diningTitle" name="diningTitle" defaultValue={c.dining.title} placeholder="Riverside Café" />
            </Field>
            <Field label="Description" htmlFor="diningBody" hint="Cuisine, meal times, whether meals are included or à la carte.">
              <Textarea id="diningBody" name="diningBody" defaultValue={c.dining.body} rows={4} />
            </Field>
            <MediaPicker name="diningMediaIds" media={media} selected={c.dining.mediaIds} max={12} label="Dining photos" />
          </div>
        </Card>
        <Card title="Nearby attractions" actions={<Checkbox name="s_nearby" defaultChecked={s.nearby} label="Show" />}>
          <Field label="One per line: Name | distance | note" htmlFor="nearby">
            <Textarea id="nearby" name="nearby" defaultValue={nearbyText} rows={5} placeholder={"Laxman Jhula | 1.2 km | 15-minute walk\nTriveni Ghat | 4 km | Evening Ganga aarti"} />
          </Field>
        </Card>
        <Card title="FAQ" actions={<Checkbox name="s_faq" defaultChecked={s.faq} label="Show page" />}>
          <Field label="Question on the first line, answer below. Leave a blank line between questions." htmlFor="faq">
            <Textarea id="faq" name="faq" defaultValue={faqText} rows={8} placeholder={"Is parking available?\nYes, free parking for 10 cars inside the property.\n\nDo you allow early check-in?\nSubject to availability, at no charge before 10 am."} />
          </Field>
        </Card>
        <Card title="Guest reviews" description="Quote real reviews and say where they came from. No star widgets you write yourself." actions={<Checkbox name="s_testimonials" defaultChecked={s.testimonials} label="Show" />}>
          <Field label="Quote, then “— Name, Source” on its own line. Blank line between reviews." htmlFor="testimonials">
            <Textarea id="testimonials" name="testimonials" defaultValue={testimonialText} rows={6} placeholder={"Spotless rooms and the best view of the Ganga.\n— Priya, Google review"} />
          </Field>
        </Card>
        <Card title="Gallery and offers pages">
          <div className="grid gap-3 sm:grid-cols-2">
            <Checkbox name="s_gallery" defaultChecked={s.gallery} label="Show Gallery page" hint="Choose gallery photos on the Photos page." />
            <Checkbox name="s_offers" defaultChecked={s.offers} label="Show Offers" hint="Add offers below." />
          </div>
        </Card>
      </ActionForm>

      <div className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Offers</h2>
        <p className="text-sm text-slate-600">Offers are pages, not automatic discounts: guests mention the code when they enquire and you apply it in your quote.</p>
        {c.offers.map((o) => (
          <Card key={o.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">{o.title}</p>
                <p className="text-sm text-slate-600">{o.body}</p>
                <p className="text-xs text-slate-500">
                  {o.code ? `Code ${o.code}` : "No code"}
                  {o.validUntil ? ` · until ${formatDate(o.validUntil)}` : ""}
                </p>
              </div>
              <ActionButton action={saveOfferAction} label="Delete" variant="danger" hidden={{ op: "delete", id: o.id }} confirm="Delete this offer?" />
            </div>
          </Card>
        ))}
        <Card title="Add an offer">
          <ActionForm action={saveOfferAction} submitLabel="Add offer">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" htmlFor="o-title" className="sm:col-span-2">
                <Input id="o-title" name="title" required placeholder="Stay 3 nights, pay for 2 (Mon–Thu)" />
              </Field>
              <Field label="Details" htmlFor="o-body" className="sm:col-span-2">
                <Textarea id="o-body" name="body" rows={3} />
              </Field>
              <Field label="Code (optional)" htmlFor="o-code">
                <Input id="o-code" name="code" maxLength={30} placeholder="MONSOON" />
              </Field>
              <Field label="Valid until (optional)" htmlFor="o-valid">
                <Input id="o-valid" name="validUntil" type="date" />
              </Field>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
