import { eq } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { ActionButton, ActionForm, CopyButton } from "@/components/forms";
import { Alert, Badge, Card, Field, Input, PageHeader, Table, Td } from "@/components/ui";
import { requireHotel } from "@/lib/auth";
import { getSubscription, subscriptionAllowsCustomDomain } from "@/lib/billing/subscription";
import { config, siteOrigin, subdomainHost } from "@/lib/config";
import { DISCONNECT_RELEASE_DAYS, DOMAIN_STATUS_COPY } from "@/lib/domains/service";
import { formatDateTime } from "@/lib/format";
import { checkDomainAction, changeSlugAction, connectDomainAction, removeDomainAction } from "./actions";

export default async function DomainPage() {
  const { hotel, role } = await requireHotel("manager");
  const db = await getDb();
  const [domains, sub] = await Promise.all([db.select().from(schema.domains).where(eq(schema.domains.hotelId, hotel.id)), getSubscription(hotel.id)]);
  const d = domains[0];
  const allowed = subscriptionAllowsCustomDomain(sub);
  const sub_ = subdomainHost(hotel.slug);
  const copy = d ? DOMAIN_STATUS_COPY[d.status] : null;

  return (
    <>
      <PageHeader title="Domain" description="Your free subdomain always works. Connect a domain you own to make it your main address; we issue and renew the SSL certificate." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Free subdomain">
          <p className="text-sm">
            <a href={siteOrigin(sub_)} target="_blank" rel="noopener noreferrer" className="font-mono font-semibold text-slate-900 underline">
              {sub_}
            </a>{" "}
            {d?.status === "active" ? <Badge>Redirects to {d.hostname}</Badge> : <Badge tone="good">Main address</Badge>}
          </p>
          {role === "owner" ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Change subdomain</summary>
              <div className="mt-3">
                <ActionForm action={changeSlugAction} submitLabel="Change" confirm="Change your subdomain? The old one will keep redirecting to the new one.">
                  <Field label="New name" htmlFor="slug" hint="Lowercase letters, digits and hyphens. The old address keeps redirecting and is never given to another property.">
                    <div className="flex items-center gap-2">
                      <Input id="slug" name="slug" defaultValue={hotel.slug} required />
                      <span className="whitespace-nowrap text-sm text-slate-500">.{config.rootHostname}</span>
                    </div>
                  </Field>
                </ActionForm>
              </div>
            </details>
          ) : null}
        </Card>
        <Card title="Before you connect">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
            <li>Keep your domain where it is. Don’t change nameservers or transfer it.</li>
            <li>Add only the record we show. Don’t delete MX, SPF, DKIM or DMARC records; your email keeps working.</li>
            <li>Use www (or another subdomain). Forward the bare domain to www at your registrar.</li>
            <li>On Cloudflare DNS, set the record to “DNS only” (grey cloud).</li>
          </ul>
        </Card>
      </div>

      <div className="mt-4">
        {d ? (
          <Card
            title={
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{d.hostname}</span>
                <Badge tone={copy!.tone === "good" ? "good" : copy!.tone === "bad" ? "bad" : copy!.tone === "warn" ? "warn" : "info"}>{copy!.label}</Badge>
              </span>
            }
            description={copy!.help}
            actions={
              <div className="flex gap-2">
                <ActionButton action={checkDomainAction} label="Check now" hidden={{ id: d.id }} />
                {role === "owner" ? <ActionButton action={removeDomainAction} label="Remove" variant="ghost" hidden={{ id: d.id }} confirm={`Remove ${d.hostname}? Your subdomain becomes the main address again.`} /> : null}
              </div>
            }
          >
            {d.status !== "active" ? (
              <>
                <p className="mb-2 text-sm font-semibold text-slate-900">Add {d.expected.length > 1 ? "these records" : "this record"} at your domain provider</p>
                <Table head={["Type", "Host / name", "Value / points to", ""]}>
                  {d.expected.map((r) => (
                    <tr key={`${r.type}-${r.name}`}>
                      <Td className="font-mono">{r.type}</Td>
                      <Td className="font-mono">
                        {r.type === "CNAME" ? r.name.split(".")[0] : r.name}
                        <span className="block text-xs text-slate-500">({r.name})</span>
                      </Td>
                      <Td className="break-all font-mono">{r.value}</Td>
                      <Td>
                        <CopyButton value={r.value} />
                      </Td>
                    </tr>
                  ))}
                </Table>
              </>
            ) : (
              <Alert tone="good">
                Live at{" "}
                <a href={`https://${d.hostname}`} className="font-semibold underline" target="_blank" rel="noopener noreferrer">
                  https://{d.hostname}
                </a>{" "}
                since {formatDateTime(d.activatedAt)}. {sub_} redirects here with a permanent redirect, so Google indexes one address.
              </Alert>
            )}
            {d.issues.length ? (
              <div className="mt-4">
                <Alert tone={d.status === "wrong_record" || d.status === "disconnected" ? "warn" : "info"}>
                  <ul className="list-disc space-y-1 pl-5">
                    {d.issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </Alert>
              </div>
            ) : null}
            {d.observed.length ? (
              <div className="mt-4 text-sm">
                <p className="font-semibold text-slate-800">What we see right now</p>
                <ul className="mt-1 font-mono text-xs text-slate-600">
                  {d.observed.map((o) => (
                    <li key={`${o.type}-${o.value}`}>
                      {o.type} {o.name} → {o.value}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {d.status === "disconnected" ? <p className="mt-3 text-sm text-red-700">If the record isn’t restored within {DISCONNECT_RELEASE_DAYS} days of disconnecting, we release this domain from your site.</p> : null}
            <p className="mt-4 text-xs text-slate-500">Last checked {formatDateTime(d.lastCheckedAt)}. We re-check automatically.</p>
          </Card>
        ) : allowed ? (
          role === "owner" ? (
            <Card title="Connect your domain">
              <ActionForm action={connectDomainAction} submitLabel="Connect domain">
                <Field label="Domain" htmlFor="hostname" hint="Usually www.yourhotel.com. If you type the bare domain we’ll suggest www.">
                  <Input id="hostname" name="hostname" placeholder="www.yourhotel.com" required />
                </Field>
              </ActionForm>
            </Card>
          ) : (
            <Alert tone="info">Ask the account owner to connect a domain.</Alert>
          )
        ) : (
          <Alert tone="info" title="Custom domains come with a paid plan">
            Your subdomain works fully during the trial.{" "}
            <Link href="/dashboard/billing" className="font-semibold underline">
              Choose a plan
            </Link>{" "}
            to connect www.yourhotel.com.
          </Alert>
        )}
      </div>
    </>
  );
}
