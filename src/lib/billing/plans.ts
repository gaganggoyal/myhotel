// The printed price. One plan, monthly or yearly: no setup fee, no commission on bookings,
// custom domain included once paid. Edit here to change pricing; amounts are in paise.
//
// Why one plan: both research passes put a website-only product in the general-builder band
// (Squarespace India ₹630–₹1,100/month) and warn against tiers that sell features not yet
// built (instant booking, channel sync). Add tiers here when those modules ship.

export type PlanInterval = "monthly" | "yearly";

export type Plan = {
  key: string;
  name: string;
  tagline: string;
  prices: Record<PlanInterval, number>;
  gstRate: number;
  trialDays: number;
  limits: { roomTypes: number; photos: number; guestEmailsPerDay: number };
  features: string[];
};

export const PLANS: Plan[] = [
  {
    key: "website",
    name: "Hotel Website",
    tagline: "Everything an independent property needs to take direct enquiries.",
    prices: { monthly: 99_900, yearly: 9_99_000 },
    gstRate: 0.18,
    trialDays: 14,
    limits: { roomTypes: 20, photos: 150, guestEmailsPerDay: 300 },
    features: [
      "Multi-page, mobile-first hotel website",
      "Free subdomain from day one",
      "Connect your own domain (with SSL) once subscribed",
      "Enquiry and request-to-book forms with WhatsApp handoff",
      "Your own UPI QR on secure payment pages",
      "Guest and owner emails sent under your hotel's name",
      "Lead inbox, reservations and payment tracking",
      "English and Hindi site language",
      "Built-in SEO: sitemap, structured data, canonical URLs",
      "Cookieless visitor analytics",
    ],
  },
];

export const DEFAULT_PLAN = PLANS[0];

/**
 * Commercial terms printed beside the price. Competitor reviews cite surprise annual
 * renewals, card-required trials and withdrawn refunds; these rules answer each one.
 */
export const COMMERCIAL_TERMS = [
  "14-day free trial on your subdomain. No card needed.",
  "No setup fee. No commission on your bookings, ever.",
  "Prices exclude 18% GST, which is shown on every invoice.",
  "Yearly plans: we email you 7 days before renewal.",
  "Cancel any time from your dashboard. Your site stays online until the end of the period you paid for.",
  "Yearly plans cancelled within 14 days of a charge are refunded in full. Promised refunds are never withdrawn.",
  "A domain you bring stays yours. Export your content and guest data at any time.",
];

export function getPlan(key: string | null | undefined): Plan {
  return PLANS.find((p) => p.key === key) ?? DEFAULT_PLAN;
}

export function priceWithGst(paise: number, gstRate: number): number {
  return Math.round(paise * (1 + gstRate));
}

/** How much the yearly price saves compared with paying monthly for 12 months. */
export function yearlySavings(plan: Plan): { paise: number; percent: number } {
  const twelve = plan.prices.monthly * 12;
  const paise = twelve - plan.prices.yearly;
  return { paise, percent: Math.round((paise / twelve) * 100) };
}
