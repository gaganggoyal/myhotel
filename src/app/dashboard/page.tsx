import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { Alert, Badge, Card, LinkButton, PageHeader, Stat } from "@/components/ui";
import { funnel } from "@/lib/analytics";
import { requireHotel } from "@/lib/auth";
import { getSubscription, STATUS_LABELS, subscriptionAllowsCustomDomain } from "@/lib/billing/subscription";
import { ENQUIRY_STATUS_LABELS, getPaymentMethod } from "@/lib/bookings";
import { activeDomainFor } from "@/lib/domains/service";
import { formatDate, formatDateTime } from "@/lib/format";
import { getDraft, hasPhotos } from "@/lib/hotel";
import { publicSiteUrl } from "@/lib/site";

export default async function Overview({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { hotel, user, role } = await requireHotel();
  const db = await getDb();
  const [{ content }, photos, payment, domain, sub, stats, recent] = await Promise.all([
    getDraft(hotel.id),
    hasPhotos(hotel.id),
    getPaymentMethod(hotel.id),
    activeDomainFor(hotel.id),
    getSubscription(hotel.id),
    funnel(hotel.id, 30),
    db
      .select()
      .from(schema.enquiries)
      .where(and(eq(schema.enquiries.hotelId, hotel.id), isNull(schema.enquiries.anonymizedAt)))
      .orderBy(desc(schema.enquiries.createdAt))
      .limit(5),
  ]);
  const denied = (await searchParams).denied === "1";

  const checklist = [
    { done: Boolean(content.property.description), label: "Describe your property", href: "/dashboard/website/property" },
    { done: content.rooms.some((r) => r.visible), label: "Add your room types", href: "/dashboard/website/rooms" },
    { done: photos, label: "Upload real photos", href: "/dashboard/website/photos" },
    { done: content.hero.mediaIds.length > 0, label: "Choose a cover photo", href: "/dashboard/website/photos" },
    { done: Boolean(content.contact.address.line1), label: "Add your full address", href: "/dashboard/website/contact" },
    { done: Boolean(content.policies.cancellation), label: "Write your cancellation policy", href: "/dashboard/website/policies" },
    { done: Boolean(user.emailVerifiedAt), label: "Verify your email", href: "/dashboard" },
    { done: Boolean(hotel.publishedVersionId), label: "Publish your website", href: "/dashboard/publish" },
    { done: Boolean(payment), label: "Add UPI payment details", href: "/dashboard/payments" },
    { done: Boolean(domain), label: subscriptionAllowsCustomDomain(sub) ? "Connect your own domain" : "Connect your own domain (after subscribing)", href: "/dashboard/domain" },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const pct = Math.round((doneCount / checklist.length) * 100);
  const siteUrl = publicSiteUrl(hotel.slug, domain?.hostname);

  return (
    <>
      <PageHeader
        title={`Namaste, ${user.name.split(" ")[0]}`}
        description={`${hotel.name} · ${STATUS_LABELS[sub?.status ?? "trialing"]}${sub?.status === "trialing" ? ` until ${formatDate(sub.trialEndsAt)}` : ""}`}
        actions={
          <>
            <a href="/preview" target="_blank" rel="noopener" className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              Preview
            </a>
            {role !== "front_desk" ? <LinkButton href="/dashboard/publish">Publish</LinkButton> : null}
          </>
        }
      />
      {!hotel.publishedVersionId && role !== "front_desk" ? (
        <div className="mb-4 flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 p-5 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-lg font-bold">Finish your website in about 10 minutes</p>
            <p className="mt-1 text-sm text-amber-50">Upload your photos, add your rooms and prices, and we’ll write and publish the rest for you.</p>
          </div>
          <LinkButton href="/setup" variant="secondary" className="shrink-0 border-white px-5 py-3">
            Continue setup →
          </LinkButton>
        </div>
      ) : null}
      {denied ? (
        <div className="mb-4">
          <Alert tone="warn">That area is limited to owners and managers.</Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Visitors (30 days)" value={stats.visitors} hint={`${stats.pageViews} page views`} />
        <Stat label="Call / WhatsApp / enquire clicks" value={stats.ctaClicks} />
        <Stat label="Enquiries & requests" value={stats.leads} hint={`${stats.bookingRequests} booking requests`} />
        <Stat label="Visitor → lead" value={`${(stats.conversion * 100).toFixed(1)}%`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={`Setup checklist · ${pct}%`} description={`${doneCount} of ${checklist.length} done`}>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
          <ul className="space-y-2">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center gap-3 text-sm">
                <span aria-hidden="true" className={c.done ? "text-emerald-600" : "text-slate-300"}>
                  {c.done ? "✓" : "○"}
                </span>
                {c.done ? (
                  <span className="text-slate-500 line-through">{c.label}</span>
                ) : (
                  <Link href={c.href} className="font-medium text-slate-900 hover:underline">
                    {c.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card
          title="Latest enquiries"
          actions={
            <Link href="/dashboard/enquiries" className="text-sm font-semibold text-slate-700 hover:underline">
              View all
            </Link>
          }
        >
          {recent.length ? (
            <ul className="divide-y divide-slate-100">
              {recent.map((e) => (
                <li key={e.id} className="py-3">
                  <Link href={`/dashboard/enquiries/${e.id}`} className="flex items-center justify-between gap-3 hover:underline">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{e.guestName}</span>
                      <span className="text-xs text-slate-500">
                        {e.ref} · {e.checkIn ? `${formatDate(e.checkIn)} → ${formatDate(e.checkOut)}` : "No dates"} · {formatDateTime(e.createdAt)}
                      </span>
                    </span>
                    <Badge tone={e.status === "new" ? "warn" : e.status === "won" ? "good" : "neutral"}>{ENQUIRY_STATUS_LABELS[e.status]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">
              No enquiries yet. Share your website link on WhatsApp, Instagram and your Google Business Profile:{" "}
              <a href={siteUrl} className="font-semibold underline" target="_blank" rel="noopener noreferrer">
                {siteUrl.replace(/^https?:\/\//, "")}
              </a>
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
