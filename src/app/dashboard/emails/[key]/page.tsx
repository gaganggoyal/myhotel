import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { ActionButton, ActionForm } from "@/components/forms";
import { Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { requireHotel } from "@/lib/auth";
import { config } from "@/lib/config";
import { TEMPLATE_MAP } from "@/lib/email/catalog";
import { renderEmail } from "@/lib/email/render";
import { hotelBrand } from "@/lib/email/send";
import { getDraft } from "@/lib/hotel";
import { resetTemplateAction, saveTemplateAction, testSendAction } from "../actions";

export default async function TemplateEditor({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const def = TEMPLATE_MAP.get(key);
  if (!def || def.stream === "platform") notFound();
  const { hotel } = await requireHotel("manager");
  const db = await getDb();
  const [override] = await db.select().from(schema.emailTemplates).where(and(eq(schema.emailTemplates.hotelId, hotel.id), eq(schema.emailTemplates.key, key)));
  const { content } = await getDraft(hotel.id);
  const copy = { subject: override?.subject ?? def.subject, body: override?.body ?? def.body };
  const vars = { ...def.sample, platform_name: config.platformName, property_name: content.property.name };
  const preview = renderEmail(def, copy, vars, hotelBrand(content));
  const variables = Array.from(new Set(Object.keys(def.sample).concat(["property_name", "property_phone", "property_address"]))).sort();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/dashboard/emails" className="text-slate-600 hover:underline">
          ← Guest emails
        </Link>
      </p>
      <PageHeader title={def.label} description={def.description} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={def.editable ? "Your wording" : "Wording"} description={def.editable ? "Edit the subject and opening message. The booking details, payment block and sender footer are added automatically and can’t be removed." : "Notifications to you use fixed wording."}>
          {def.editable ? (
            <ActionForm action={saveTemplateAction} submitLabel="Save template">
              <input type="hidden" name="key" value={key} />
              <Field label="Subject" htmlFor="subject">
                <Input id="subject" name="subject" defaultValue={copy.subject} maxLength={200} required />
              </Field>
              <Field label="Message" htmlFor="body" hint="Leave a blank line between paragraphs.">
                <Textarea id="body" name="body" defaultValue={copy.body} rows={10} maxLength={4000} required />
              </Field>
            </ActionForm>
          ) : (
            <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{copy.body}</pre>
          )}
          <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <ActionButton action={testSendAction} label="Send me a test" hidden={{ key }} />
            {override ? <ActionButton action={resetTemplateAction} label="Restore default" variant="ghost" hidden={{ key }} confirm="Replace your wording with the default?" /> : null}
          </div>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-semibold text-slate-700">Available variables</summary>
            <p className="mt-2 flex flex-wrap gap-1.5">
              {variables.map((v) => (
                <code key={v} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{`{{${v}}}`}</code>
              ))}
            </p>
          </details>
        </Card>
        <Card title="Preview (sample guest)" description={`Subject: ${preview.subject}`}>
          <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[640px] w-full rounded-lg border border-slate-200" />
        </Card>
      </div>
    </>
  );
}
