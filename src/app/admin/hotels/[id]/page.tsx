import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { ActionButton, ActionForm } from "@/components/forms";
import { Badge, Card, Field, Input, PageHeader, Table, Td } from "@/components/ui";
import { STATUS_LABELS } from "@/lib/billing/subscription";
import { config, siteOrigin, subdomainHost } from "@/lib/config";
import { DOMAIN_STATUS_COPY } from "@/lib/domains/service";
import { formatDate, formatDateTime } from "@/lib/format";
import { adminHotelAction } from "../../actions";

export default async function AdminHotel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [hotel] = await db.select().from(schema.hotels).where(eq(schema.hotels.id, id));
  if (!hotel) notFound();
  const [[sub], domains, members, logs, pm] = await Promise.all([
    db.select().from(schema.subscriptions).where(eq(schema.subscriptions.hotelId, id)),
    db.select().from(schema.domains).where(eq(schema.domains.hotelId, id)),
    db.select({ m: schema.memberships, u: schema.users }).from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId)).where(eq(schema.memberships.hotelId, id)),
    db.select().from(schema.auditLogs).where(eq(schema.auditLogs.hotelId, id)).orderBy(desc(schema.auditLogs.createdAt)).limit(60),
    db.select().from(schema.paymentMethods).where(eq(schema.paymentMethods.hotelId, id)),
  ]);
  const h = { hotelId: id };

  return (
    <>
      <PageHeader
        title={hotel.name}
        description={`${hotel.slug} · created ${formatDate(hotel.createdAt)}`}
        actions={
          <a href={siteOrigin(subdomainHost(hotel.slug))} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">
            Open site ↗
          </a>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Website">
          <p className="text-sm">Status: {hotel.siteStatus}</p>
          {hotel.adminSuspendedAt ? (
            <>
              <p className="mt-2 text-sm text-red-700">Suspended {formatDateTime(hotel.adminSuspendedAt)}: {hotel.adminSuspendReason}</p>
              <ActionButton action={adminHotelAction} label="Lift suspension" variant="primary" hidden={{ ...h, op: "unsuspend" }} className="mt-3" />
            </>
          ) : (
            <ActionForm action={adminHotelAction} submitLabel="Suspend site" submitVariant="danger" confirm="Suspend this site? Guests will see a maintenance page." className="mt-3">
              <input type="hidden" name="hotelId" value={id} />
              <input type="hidden" name="op" value="suspend" />
              <Field label="Reason (shown to owner)" htmlFor="reason">
                <Input id="reason" name="reason" placeholder="Impersonation report under review" required />
              </Field>
            </ActionForm>
          )}
        </Card>
        <Card title="Guest email">
          {hotel.mailPausedAt ? (
            <>
              <p className="text-sm text-red-700">Paused: {hotel.mailPauseReason}</p>
              <ActionButton action={adminHotelAction} label="Resume guest email" variant="primary" hidden={{ ...h, op: "resume_mail" }} className="mt-3" />
            </>
          ) : (
            <>
              <p className="text-sm">Sending normally.</p>
              <ActionButton action={adminHotelAction} label="Pause guest email" variant="danger" hidden={{ ...h, op: "pause_mail", reason: "Paused by support" }} confirm="Pause this hotel's guest email?" className="mt-3" />
            </>
          )}
          <p className="mt-3 text-xs text-slate-500">Reply-to: {hotel.replyToEmail ?? "owner login"} {hotel.replyToVerifiedAt ? "(verified)" : ""}</p>
        </Card>
        <Card title="Subscription">
          {sub ? (
            <>
              <p className="text-sm">
                <Badge>{STATUS_LABELS[sub.status]}</Badge> {sub.provider} · {sub.interval}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Trial ends {formatDate(sub.trialEndsAt)} · period ends {formatDate(sub.currentPeriodEnd)}
                {sub.suspendedReason ? ` · ${sub.suspendedReason}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton action={adminHotelAction} label="Extend trial 7 days" hidden={{ ...h, op: "extend_trial", days: "7" }} />
                <ActionButton action={adminHotelAction} label="Activate (offline payment, yearly)" hidden={{ ...h, op: "activate_manual", interval: "yearly" }} confirm="Record an offline yearly payment and activate?" />
              </div>
            </>
          ) : (
            <p className="text-sm">None</p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Team">
          <ul className="text-sm">
            {members.map(({ m, u }) => (
              <li key={u.id}>
                {u.name} · {u.email} · {m.role} {u.emailVerifiedAt ? <Badge tone="good">verified</Badge> : <Badge tone="warn">unverified</Badge>}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Domains & payment details">
          {domains.map((d) => (
            <div key={d.id} className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {d.hostname} · {DOMAIN_STATUS_COPY[d.status].label} · {d.provider}
              </span>
              {d.status !== "active" && d.provider === "manual" ? <ActionButton action={adminHotelAction} label="Force active" hidden={{ ...h, op: "force_domain", domainId: d.id }} confirm="Only if TLS is confirmed working for this hostname." /> : null}
            </div>
          ))}
          {pm[0] ? (
            <p className="mt-2 text-sm">
              UPI: {pm[0].payeeName} · <span className="font-mono">{pm[0].vpa}</span> {pm[0].qrWarning ? <Badge tone="warn">QR warning</Badge> : null}
            </p>
          ) : (
            <p className="text-sm text-slate-500">No UPI details.</p>
          )}
          <p className="mt-2 text-xs text-slate-500">Mail From: {hotel.slug}@{config.email.fromDomain}</p>
        </Card>
      </div>

      <h2 className="mb-3 mt-6 font-semibold">Audit log</h2>
      <Table head={["When", "Who", "Action", "Data"]}>
        {logs.map((l) => (
          <tr key={l.id}>
            <Td className="whitespace-nowrap">{formatDateTime(l.createdAt)}</Td>
            <Td>{l.actorLabel}</Td>
            <Td className="font-mono text-xs">{l.action}</Td>
            <Td className="max-w-md break-all font-mono text-xs">{l.data ? JSON.stringify(l.data) : ""}</Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
