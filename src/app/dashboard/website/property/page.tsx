import { ActionForm } from "@/components/forms";
import { MediaPicker } from "@/components/media";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { PROPERTY_TYPE_LABELS, PROPERTY_TYPES } from "@/lib/content";
import { savePropertyAction } from "../actions";
import { loadEditor, Revision } from "../shared";

export default async function PropertyEditor() {
  const { content: c, revision, media } = await loadEditor();
  return (
    <>
      <PageHeader title="Property & home page" description="What guests read first. Keep it specific: location, views, what makes a stay here different." />
      <ActionForm action={savePropertyAction}>
        <Revision value={revision} />
        <Card title="About the property">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Property name" htmlFor="name">
              <Input id="name" name="name" defaultValue={c.property.name} required maxLength={80} />
            </Field>
            <Field label="Type" htmlFor="type">
              <Select id="type" name="type" defaultValue={c.property.type}>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PROPERTY_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tagline" htmlFor="tagline" hint="One line, e.g. “Riverside rooms 5 minutes from Laxman Jhula”." className="sm:col-span-2">
              <Input id="tagline" name="tagline" defaultValue={c.property.tagline} maxLength={120} />
            </Field>
            <Field label="Description" htmlFor="description" hint="2–4 short paragraphs. Separate paragraphs with a blank line." className="sm:col-span-2">
              <Textarea id="description" name="description" defaultValue={c.property.description} rows={8} maxLength={4000} />
            </Field>
            <Field label="Why book direct?" htmlFor="whyDirect" hint="Shown as a banner on the home page, e.g. “Best rate guaranteed and free early check-in when available.” Only promise what you deliver." className="sm:col-span-2">
              <Input id="whyDirect" name="whyDirect" defaultValue={c.property.whyDirect} maxLength={160} />
            </Field>
          </div>
        </Card>
        <Card title="Home page cover" description="The first thing guests see. A wide landscape photo of your best view or façade works best.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Headline" htmlFor="headline" hint="Leave blank to use your property name.">
              <Input id="headline" name="headline" defaultValue={c.hero.headline} maxLength={90} />
            </Field>
            <Field label="Sub-headline" htmlFor="subheadline" hint="Leave blank to use your tagline.">
              <Input id="subheadline" name="subheadline" defaultValue={c.hero.subheadline} maxLength={200} />
            </Field>
          </div>
          <div className="mt-5">
            <MediaPicker name="heroMediaIds" media={media} selected={c.hero.mediaIds} max={6} label="Cover photo (first one is used)" />
          </div>
        </Card>
      </ActionForm>
    </>
  );
}
