import { ActionForm } from "@/components/forms";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { saveSeoAction } from "../actions";
import { loadEditor, Revision } from "../shared";

export default async function SeoEditor() {
  const { content: c, revision, photos } = await loadEditor();
  const fallbackTitle = `${c.property.name}${c.contact.address.city ? `, ${c.contact.address.city}` : ""}`;
  const title = c.seo.title || fallbackTitle;
  const description = c.seo.description || c.property.tagline;
  return (
    <>
      <PageHeader title="Search (SEO)" description="We generate your sitemap, hotel structured data and canonical address automatically. Here you control how your home page appears in Google." />
      <ActionForm action={saveSeoAction}>
        <Revision value={revision} />
        <Card>
          <div className="space-y-5">
            <Field label="Page title" htmlFor="title" hint={`Up to 70 characters. Blank uses “${fallbackTitle}”. Include your town.`}>
              <Input id="title" name="title" defaultValue={c.seo.title} maxLength={70} />
            </Field>
            <Field label="Description" htmlFor="description" hint="Up to 170 characters: what, where, and why stay.">
              <Textarea id="description" name="description" defaultValue={c.seo.description} maxLength={170} rows={3} />
            </Field>
            <Field label="Image when shared on WhatsApp / social" htmlFor="ogMediaId">
              <Select id="ogMediaId" name="ogMediaId" defaultValue={c.seo.ogMediaId ?? ""}>
                <option value="">Use the home page cover</option>
                {photos.map((p, i) => (
                  <option key={p.id} value={p.id}>
                    {p.alt || `Photo ${i + 1}`}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
        <Card title="Preview in Google">
          <div className="max-w-xl rounded-lg border border-slate-200 p-4">
            <p className="truncate text-lg text-blue-800">{title}</p>
            <p className="mt-1 line-clamp-2 text-sm text-slate-600">{description || "Add a description so Google doesn’t pick random text from your page."}</p>
          </div>
        </Card>
      </ActionForm>
    </>
  );
}
