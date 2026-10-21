import { and, count, desc, eq, gte } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { ActionButton } from "@/components/forms";
import { Badge, PageHeader, Stat, Table, Td } from "@/components/ui";
import { STATUS_LABELS } from "@/lib/billing/subscription";
import { DOMAIN_STATUS_COPY } from "@/lib/domains/service";
import { daysBefore, formatDate, formatDateTime } from "@/lib/format";
import { runJobsAction } from "./actions";

export default async function AdminHotels() {
  const db = await getDb();
  const rows = await db
    .select({ hotel: schema.hotels, sub: schema.subscriptions, owner: schema.users })
    .from(schema.hotels)
    .leftJoin(schema.subscriptions, eq(schema.subscriptions.hotelId, schema.hotels.id))
    .leftJoin(schema.memberships, and(eq(schema.memberships.hotelId, schema.hotels.id), eq(schema.memberships.role, "owner")))
    .leftJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .orderBy(desc(schema.hotels.createdAt))
    .limit(500);
  const domains = await db.select().from(schema.domains);
  const domainBy = new Map(domains.map((d) => [d.hotelId, d]));
  const since = daysBefore(30);
  const leadCounts = await db.select({ hotelId: schema.enquiries.hotelId, n: count() }).from(schema.enquiries).where(gte(schema.enquiries.createdAt, since)).groupBy(schema.enquiries.hotelId);
  const leadsBy = new Map(leadCounts.map((l) => [l.hotelId, l.n]));
  const statusCounts = rows.reduce<Record<string, number>>((acc, r) => {
    const k = r.sub?.status ?? "none";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const active30 = Array.from(leadsBy.values()).filter((n) => n > 0).length;

  return (
    <>
      <PageHeader title="Hotels" description="Tenant health at a glance." actions={<ActionButton action={runJobsAction} label="Run scheduled jobs now" />} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Hotels" value={rows.length} />
        <Stat label="Trialing" value={statusCounts.trialing ?? 0} />
        <Stat label="Paying" value={(statusCounts.active ?? 0) + (statusCounts.past_due ?? 0) + (statusCounts.grace_period ?? 0)} />
        <Stat label="Suspended / cancelled" value={(statusCounts.suspended ?? 0) + (statusCounts.cancelled ?? 0)} />
        <Stat label="With a lead in 30 days" value={active30} hint="North-star: qualified direct actions" />
      </div>
      <Table head={["Hotel", "Owner", "Plan", "Site", "Domain", "Leads 30d", "Created"]}>
        {rows.map(({ hotel: h, sub, owner }) => {
          const d = domainBy.get(h.id);
          return (
            <tr key={h.id}>
              <Td>
                <Link href={`/admin/hotels/${h.id}`} className="font-semibold text-slate-900 hover:underline">
                  {h.name}
                </Link>
                <span className="block text-xs text-slate-500">{h.slug}</span>
                {h.adminSuspendedAt ? <Badge tone="bad">Suspended</Badge> : null} {h.mailPausedAt ? <Badge tone="warn">Mail paused</Badge> : null}
              </Td>
              <Td>
                {owner?.email}
                <span className="block text-xs text-slate-500">last login {formatDateTime(owner?.lastLoginAt)}</span>
              </Td>
              <Td>
                {sub ? <Badge tone={sub.status === "active" ? "good" : sub.status === "trialing" ? "info" : "warn"}>{STATUS_LABELS[sub.status]}</Badge> : "—"}
                {sub?.status === "trialing" ? <span className="block text-xs text-slate-500">ends {formatDate(sub.trialEndsAt)}</span> : null}
              </Td>
              <Td>{h.siteStatus}</Td>
              <Td>{d ? `${d.hostname} (${DOMAIN_STATUS_COPY[d.status].label})` : "—"}</Td>
              <Td className="tabular-nums">{leadsBy.get(h.id) ?? 0}</Td>
              <Td className="whitespace-nowrap">{formatDate(h.createdAt)}</Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
