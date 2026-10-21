import type { Metadata } from "next";
import { PricingCard } from "@/components/PricingCard";
import { DEFAULT_PLAN } from "@/lib/billing/plans";
import { formatINR } from "@/lib/format";

export const metadata: Metadata = {
  title: "Pricing",
  description: `One plan for independent hotels: ${formatINR(DEFAULT_PLAN.prices.monthly)}/month or ${formatINR(DEFAULT_PLAN.prices.yearly)}/year plus GST. No setup fee, no commission, 14-day free trial without a card.`,
};

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Simple pricing for independent properties</h1>
      <p className="mt-3 max-w-2xl text-lg text-slate-600">
        Everything is included: hosting, SSL, your domain, guest emails, payments page, updates and support. The price does not change with your number of rooms or bookings.
      </p>
      <div className="mt-10">
        <PricingCard />
      </div>
    </div>
  );
}
