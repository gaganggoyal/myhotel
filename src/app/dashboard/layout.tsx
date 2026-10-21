import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/forms";
import { resendVerificationAction, logoutAction } from "@/app/(auth)/actions";
import { requireHotel } from "@/lib/auth";
import { getSubscription, subscriptionServesSite } from "@/lib/billing/subscription";
import { newEnquiryCount, openPaymentCount } from "@/lib/bookings";
import { config } from "@/lib/config";
import { daysUntil, formatDate } from "@/lib/format";
import { activeDomainFor } from "@/lib/domains/service";
import { publicSiteUrl } from "@/lib/site";
import { DashboardNav, type NavGroup } from "./nav";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, hotel, role } = await requireHotel();
  const [sub, enquiries, payments, domain] = await Promise.all([getSubscription(hotel.id), newEnquiryCount(hotel.id), openPaymentCount(hotel.id), activeDomainFor(hotel.id)]);
  const siteUrl = publicSiteUrl(hotel.slug, domain?.hostname);
  const staff = role !== "front_desk";
  const groups: NavGroup[] = [
    {
      title: "Property",
      items: [
        { href: "/dashboard", label: "Overview" },
        { href: "/dashboard/enquiries", label: "Enquiries", badge: enquiries },
        { href: "/dashboard/reservations", label: "Reservations", badge: payments },
        { href: "/dashboard/analytics", label: "Analytics" },
      ],
    },
    ...(staff
      ? [
          {
            title: "Website",
            items: [
              { href: "/dashboard/website/property", label: "Property & home" },
              { href: "/dashboard/website/rooms", label: "Rooms" },
              { href: "/dashboard/website/photos", label: "Photos" },
              { href: "/dashboard/website/amenities", label: "Amenities" },
              { href: "/dashboard/website/policies", label: "Policies" },
              { href: "/dashboard/website/contact", label: "Contact & location" },
              { href: "/dashboard/website/pages", label: "Extra pages" },
              { href: "/dashboard/website/design", label: "Design & language" },
              { href: "/dashboard/website/booking", label: "Booking mode" },
              { href: "/dashboard/website/seo", label: "Search (SEO)" },
              { href: "/dashboard/publish", label: "Preview & publish" },
            ],
          },
          {
            title: "Setup",
            items: [
              { href: "/dashboard/payments", label: "UPI payments" },
              { href: "/dashboard/emails", label: "Guest emails" },
              { href: "/dashboard/domain", label: "Domain" },
              { href: "/dashboard/billing", label: "Plan & billing" },
              { href: "/dashboard/settings", label: "Settings" },
              { href: "/dashboard/activity", label: "Activity log" },
            ],
          },
        ]
      : []),
  ];

  const trialDaysLeft = sub?.status === "trialing" && sub.trialEndsAt ? daysUntil(sub.trialEndsAt) : null;
  const serving = subscriptionServesSite(sub);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-600 text-sm font-black text-white" aria-label={`${config.platformName} dashboard`}>
              {config.platformName.slice(0, 1)}
            </Link>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{hotel.name}</p>
              <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-slate-500 hover:underline">
                {siteUrl.replace(/^https?:\/\//, "")} ↗
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user.isPlatformAdmin ? (
              <Link href="/admin" className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
                Admin
              </Link>
            ) : null}
            <form action={logoutAction}>
              <button className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Log out</button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6 sm:px-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20">
            <DashboardNav groups={groups} />
          </div>
        </aside>
        <div className="min-w-0 flex-1 space-y-4">
          <details className="rounded-xl border border-slate-200 bg-white p-3 lg:hidden">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">Menu</summary>
            <div className="mt-3">
              <DashboardNav groups={groups} />
            </div>
          </details>

          {!user.emailVerifiedAt ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span>
                Verify <strong>{user.email}</strong> to publish your website. Check your inbox for our email.
              </span>
              <ActionButton action={resendVerificationAction} label="Resend email" />
            </div>
          ) : null}
          {trialDaysLeft != null ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <span>
                Free trial: <strong>{trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left</strong> (ends {formatDate(sub?.trialEndsAt)}). No card needed until you choose a plan.
              </span>
              <Link href="/dashboard/billing" className="font-semibold underline">
                Choose a plan
              </Link>
            </div>
          ) : null}
          {!serving ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              Your website is offline ({sub?.suspendedReason ?? "no active plan"}). Guests see a maintenance page. Nothing has been deleted.{" "}
              <Link href="/dashboard/billing" className="font-semibold underline">
                Reactivate
              </Link>
            </div>
          ) : null}
          {hotel.adminSuspendedAt ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              This website was suspended by {config.platformName}: {hotel.adminSuspendReason}. Contact {config.email.support}.
            </div>
          ) : null}
          {hotel.mailPausedAt ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              Guest emails are paused ({hotel.mailPauseReason}). Enquiries still reach you. Contact {config.email.support} to resume.
            </div>
          ) : null}
          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
