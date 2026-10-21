import { BarSeries } from "@/components/BarSeries";
import { Card, PageHeader, Stat } from "@/components/ui";
import { dailySeries, funnel, topBreakdown } from "@/lib/analytics";
import { requireHotel } from "@/lib/auth";

const CTA_LABELS: Record<string, string> = {
  enquire_hero: "Enquire (home banner)",
  enquire_header: "Enquire (header)",
  enquire_sticky: "Enquire (mobile bar)",
  enquire_room: "Enquire (room page)",
  enquire_offer: "Enquire (offer)",
  whatsapp_hero: "WhatsApp (home banner)",
  whatsapp_sticky: "WhatsApp (mobile bar)",
  whatsapp_footer: "WhatsApp (footer)",
  whatsapp_contact: "WhatsApp (contact page)",
  whatsapp_after_enquiry: "WhatsApp (after enquiry)",
  call_hero: "Call (home banner)",
  call_sticky: "Call (mobile bar)",
  call_footer: "Call (footer)",
  call_contact: "Call (contact page)",
  directions: "Get directions",
  upi_intent: "Pay in UPI app",
  submit_enquiry: "Submitted enquiry",
  submit_request: "Submitted booking request",
};

function Breakdown({ title, rows, label = (k: string) => k }: { title: string; rows: { key: string | null; n: number }[]; label?: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <Card title={title}>
      {rows.length ? (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.key ?? "none"}>
                <td className="py-1.5 pr-3">
                  <span className="block truncate text-slate-800">{label(r.key ?? "—")}</span>
                  <span className="mt-1 block h-1.5 rounded-full bg-slate-700" style={{ width: `${(r.n / max) * 100}%` }} aria-hidden="true" />
                </td>
                <td className="w-12 py-1.5 text-right tabular-nums text-slate-700">{r.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-slate-500">No data yet.</p>
      )}
    </Card>
  );
}

export default async function AnalyticsPage() {
  const { hotel } = await requireHotel();
  const [f, series, pages, ctas, refs, utm, devices] = await Promise.all([
    funnel(hotel.id, 30),
    dailySeries(hotel.id, 30),
    topBreakdown(hotel.id, "path", "page_view"),
    topBreakdown(hotel.id, "cta", "cta_click"),
    topBreakdown(hotel.id, "referrer", "page_view"),
    topBreakdown(hotel.id, "utmSource", "page_view"),
    topBreakdown(hotel.id, "device", "page_view"),
  ]);
  return (
    <>
      <PageHeader title="Analytics" description="Last 30 days. Counted without cookies: we see visits and clicks, never who the visitor is." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Unique visitors / day, summed" value={f.visitors} hint={`${f.pageViews} page views`} />
        <Stat label="Call · WhatsApp · enquire clicks" value={f.ctaClicks} />
        <Stat label="Enquiries + booking requests" value={f.leads} hint={`${f.enquiries} enquiries · ${f.bookingRequests} requests`} />
        <Stat label="Visitor → lead" value={`${(f.conversion * 100).toFixed(1)}%`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <BarSeries title="Page views per day" unit="views" data={series.map((s) => ({ day: s.day, value: s.views }))} />
        <BarSeries title="Leads per day" unit="leads" color="#b45309" data={series.map((s) => ({ day: s.day, value: s.leads }))} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Breakdown title="Top pages" rows={pages} />
        <Breakdown title="Buttons guests tap" rows={ctas} label={(k) => CTA_LABELS[k] ?? k} />
        <Breakdown title="Referring sites" rows={refs} />
        <Breakdown title="Campaigns (utm_source)" rows={utm} />
        <Breakdown title="Devices" rows={devices} label={(k) => k[0].toUpperCase() + k.slice(1)} />
      </div>
      <p className="mt-4 text-xs text-slate-500">Tip: add ?utm_source=instagram (or google_business, whatsapp…) to links you share to see which channel brings enquiries.</p>
    </>
  );
}
