import type { Metadata } from "next";
import { PricingCard } from "@/components/PricingCard";
import { LinkButton } from "@/components/ui";
import { DEFAULT_PLAN } from "@/lib/billing/plans";
import { config, siteOrigin, subdomainHost } from "@/lib/config";
import { formatINR } from "@/lib/format";

export const metadata: Metadata = {
  title: { absolute: `${config.platformName} – Your hotel's own direct-booking website, live today` },
  description:
    "Mobile-first websites for independent hotels, homestays and guest houses in India. Direct enquiries, WhatsApp, your own UPI QR, guest emails and your own domain. No developer, no commission.",
};

const steps = [
  { t: "Upload your photos", d: "Pick them straight from your phone. We resize them for fast pages and you choose the cover." },
  { t: "Add rooms and prices", d: "Tap what you offer: room types, beds, facilities, check-in times and your cancellation rule." },
  { t: "We write your website", d: "Your home page, room descriptions, FAQ and Google text, written for you in English or Hindi." },
  { t: "Go live", d: `One tap publishes at yourhotel.${config.rootHostname}. Connect www.yourhotel.com whenever you like.` },
];

const features = [
  { t: "Enquiries and booking requests", d: "Guests pick dates, room and guests. You get an email instantly; they get a reference number." },
  { t: "WhatsApp in one tap", d: "Sticky Call, WhatsApp and Enquire buttons on every page, plus a pre-filled WhatsApp follow-up." },
  { t: "Your UPI, your money", d: "Send a secure payment page with your own UPI QR and ID. Guests pay you directly; you mark it received." },
  { t: "Emails in your hotel’s name", d: "Confirmations, payment instructions and receipts sent as “Your Hotel via " + config.platformName + "”. Replies come to you." },
  { t: "Lead inbox and reservations", d: "Track every enquiry from new to booked, convert it to a reservation and see what is paid." },
  { t: "Found on Google", d: "Fast pages, sitemap, hotel structured data and one canonical address, so Google indexes one site, not two." },
  { t: "Draft, preview, publish, undo", d: "Edit without breaking the live site. Every publish is saved, so you can roll back in one click." },
  { t: "Privacy built in", d: "Cookie-free visitor stats, a privacy notice for your guests and data export whenever you want it." },
];

const honest = [
  { t: "No fake “instant confirmation”", d: "Your rooms are also sold on OTAs. We show “request booking” until a real availability calendar is connected, so you never overbook." },
  { t: "We never touch guest money", d: "Payments go straight to your bank through your UPI. A screenshot is never treated as proof; you confirm what you received." },
  { t: "No commission", d: "One printed price. We don’t take a percentage of your direct bookings or your OTA revenue." },
];

const faqs = [
  { q: "Do I need a credit card for the free trial?", a: "No. You get 14 days on your free subdomain with everything included. Choose monthly or yearly when you are ready." },
  { q: "Can I use my own domain?", a: "Yes, on any paid plan. Keep your domain at your current registrar. We show the exact record to add and issue the SSL certificate automatically. Your email records are never touched." },
  { q: "Will this replace Booking.com or MakeMyTrip?", a: "No. It adds a direct channel you own. Guests who find you on an OTA or Google can contact you directly, with no commission." },
  { q: "Can guests pay online?", a: "Guests pay your UPI ID or QR directly from a secure payment page. You confirm the payment after checking your account. Gateway payment links are on our roadmap." },
  { q: "Do you provide email inboxes?", a: "We send all guest emails for you under your hotel’s name, and replies go to the inbox you already use. If you want reservations@yourhotel.com, use Google Workspace or Zoho on your own domain." },
  { q: "What happens if I stop paying?", a: "Your site shows a maintenance page; nothing is deleted. Subscribe again and it is back instantly. You can export your data at any time." },
];

export default function LandingPage() {
  const demo = siteOrigin(subdomainHost("river-view-retreat"));
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-amber-50 to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:py-24">
          <div>
            <p className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-800">For independent hotels, homestays and guest houses</p>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">Your hotel’s own direct-booking website, live today.</h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              Upload your photos, add your rooms and prices, and we write and publish a professional, mobile-first website for you, with direct enquiries, WhatsApp and your own UPI payments. No developer, no writing and no commission.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/signup" variant="brand" className="px-6 py-3 text-base">
                Start 14-day free trial
              </LinkButton>
              <a href={demo} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-800 hover:bg-slate-50">
                See a demo hotel site →
              </a>
            </div>
            <p className="mt-4 text-sm text-slate-500">No card needed · {formatINR(DEFAULT_PLAN.prices.monthly)}/month or {formatINR(DEFAULT_PLAN.prices.yearly)}/year + GST · Cancel any time</p>
          </div>
          <div className="relative">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
              <div className="flex items-center gap-1.5 border-b border-slate-100 px-2 pb-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                <span className="ml-3 truncate rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">www.riverviewretreat.in</span>
              </div>
              <div className="mt-3 rounded-xl bg-gradient-to-br from-[#7c2d12] to-[#b45309] p-6 text-white">
                <p className="font-serif text-2xl">River View Retreat</p>
                <p className="mt-1 text-sm text-white/80">Riverside rooms in Tapovan, Rishikesh</p>
                <div className="mt-6 flex gap-2 text-xs font-semibold">
                  <span className="rounded bg-white px-3 py-1.5 text-[#7c2d12]">Request booking</span>
                  <span className="rounded border border-white/60 px-3 py-1.5">WhatsApp</span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                {["Deluxe River View", "Garden Cottage", "Family Suite"].map((r) => (
                  <div key={r} className="rounded-lg bg-slate-50 p-2">
                    <div className="h-12 rounded bg-gradient-to-br from-sky-200 to-emerald-200" />
                    <p className="mt-1.5 font-semibold text-slate-800">{r}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">New booking request · RVR-7K3Q9M · 12–15 Dec · 2 adults</div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-6 text-center text-sm font-medium text-slate-700 sm:px-6 md:grid-cols-4">
          <li>Free subdomain on day one</li>
          <li>Your own domain with SSL</li>
          <li>English and Hindi</li>
          <li>0% commission</li>
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Photos and details in. Website out.</h2>
        <p className="mt-2 text-slate-600">Most owners finish in about 10 minutes, on their phone.</p>
        <ol className="mt-10 grid gap-6 md:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.t} className="rounded-xl border border-slate-200 p-5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-900 text-sm font-bold text-white">{i + 1}</span>
              <p className="mt-4 font-semibold text-slate-900">{s.t}</p>
              <p className="mt-2 text-sm text-slate-600">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Built for how small hotels actually work</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.t} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="font-semibold text-slate-900">{f.t}</p>
                <p className="mt-2 text-sm text-slate-600">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">What we deliberately don’t do</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {honest.map((h) => (
            <div key={h.t} className="rounded-xl border-l-4 border-amber-500 bg-amber-50/50 p-5">
              <p className="font-semibold text-slate-900">{h.t}</p>
              <p className="mt-2 text-sm text-slate-700">{h.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">One plan. One printed price.</h2>
          <p className="mt-2 text-slate-600">Hosting, SSL, updates, support and every feature included.</p>
          <div className="mt-8">
            <PricingCard />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Questions owners ask</h2>
        <div className="mt-8 divide-y divide-slate-200">
          {faqs.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="cursor-pointer list-none font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                <span className="mr-2 inline-block text-amber-600 transition group-open:rotate-90">›</span>
                {f.q}
              </summary>
              <p className="mt-2 pl-5 text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-12 rounded-2xl bg-slate-900 p-8 text-center text-white">
          <p className="text-2xl font-bold">Launch your direct-booking website today</p>
          <p className="mt-2 text-slate-300">14 days free. No card. Your subdomain is ready in minutes.</p>
          <LinkButton href="/signup" variant="brand" className="mt-6 px-6 py-3 text-base">
            Create my hotel website
          </LinkButton>
        </div>
      </section>
    </>
  );
}
