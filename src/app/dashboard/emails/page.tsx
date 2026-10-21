import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { ActionForm } from "@/components/forms";
import { Badge, Card, Field, Input, PageHeader, Table, Td, type Tone } from "@/components/ui";
import type { EmailStatus } from "@/db/schema";
import { requireHotel } from "@/lib/auth";
import { config } from "@/lib/config";
import { EDITABLE_TEMPLATES, TEMPLATES } from "@/lib/email/catalog";
import { hotelInbox } from "@/lib/email/send";
import { formatDateTime } from "@/lib/format";
import { changeReplyToAction } from "./actions";

const TONE: Record<EmailStatus, Tone> = { queued: "neutral", sent: "info", delivered: "good", failed: "bad", suppressed: "warn", paused: "warn", bounced: "bad", complained: "bad" };

export default async function EmailsPage() {
  const { hotel } = await requireHotel("manager");
  const db = await getDb();
  const [inbox, log, overrides] = await Promise.all([
    hotelInbox(hotel.id),
    db.select().from(schema.emailMessages).where(eq(schema.emailMessages.hotelId, hotel.id)).orderBy(desc(schema.emailMessages.createdAt)).limit(40),
    db.select({ key: schema.emailTemplates.key }).from(schema.emailTemplates).where(eq(schema.emailTemplates.hotelId, hotel.id)),
  ]);
  const edited = new Set(overrides.map((o) => o.key));
  const ownerTemplates = TEMPLATES.filter((t) => t.stream === "hotel_owner");

  return (
    <>
      <PageHeader title="Guest emails" description="We send booking emails for you from our authenticated mail domain, under your hotel’s name. Guests’ replies go straight to your inbox." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Sender">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Guests see it from</dt>
              <dd className="font-mono text-slate-900">
                {hotel.name} via {config.platformName} &lt;{hotel.slug}@{config.email.fromDomain}&gt;
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Replies and new-enquiry alerts go to</dt>
              <dd className="font-semibold text-slate-900">
                {inbox} {hotel.replyToVerifiedAt ? <Badge tone="good">Verified</Badge> : <Badge>Account email</Badge>}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            Sending as @yourhotel.com (with your own SPF/DKIM) and full mailboxes are not part of this plan. Mail always says who sent it, which is what keeps it out of spam.
          </p>
        </Card>
        <Card title="Use a different inbox">
          <ActionForm action={changeReplyToAction} submitLabel="Send confirmation link">
            <Field label="Front-desk email" htmlFor="email" hint="We confirm the address before using it, so a typo never sends guests’ replies to a stranger.">
              <Input id="email" name="email" type="email" placeholder="frontdesk@yourhotel.com" required />
            </Field>
          </ActionForm>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900">Templates sent to guests</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {EDITABLE_TEMPLATES.map((t) => (
          <Link key={t.key} href={`/dashboard/emails/${t.key}`} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400">
            <p className="font-semibold text-slate-900">
              {t.label} {edited.has(t.key) ? <Badge tone="info">Edited</Badge> : null}
            </p>
            <p className="mt-1 text-sm text-slate-600">{t.description}</p>
          </Link>
        ))}
      </div>
      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900">Notifications sent to you</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {ownerTemplates.map((t) => (
          <Link key={t.key} href={`/dashboard/emails/${t.key}`} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400">
            <p className="font-semibold text-slate-900">{t.label}</p>
            <p className="mt-1 text-sm text-slate-600">{t.description}</p>
          </Link>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900">Delivery log</h2>
      {log.length ? (
        <Table head={["Sent", "To", "Subject", "Status"]}>
          {log.map((m) => (
            <tr key={m.id}>
              <Td className="whitespace-nowrap">{formatDateTime(m.createdAt)}</Td>
              <Td>{m.toEmail}</Td>
              <Td>{m.subject}</Td>
              <Td>
                <Badge tone={TONE[m.status]}>{m.status}</Badge>
                {m.error ? <span className="block text-xs text-slate-500">{m.error}</span> : null}
              </Td>
            </tr>
          ))}
        </Table>
      ) : (
        <p className="text-sm text-slate-600">No emails sent yet.</p>
      )}
    </>
  );
}
