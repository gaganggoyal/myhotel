import { and, count, countDistinct, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { todayIST } from "./format";

const { analyticsEvents: ev } = schema;

export function daysAgo(n: number): string {
  const d = new Date(Date.parse(`${todayIST()}T00:00:00Z`) - n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Funnel for the last N days: visitors → CTA clicks → enquiries/booking requests. */
export async function funnel(hotelId: string, days = 30) {
  const db = await getDb();
  const since = daysAgo(days - 1);
  const rows = await db
    .select({ type: ev.type, n: count(), visitors: countDistinct(ev.visitorHash) })
    .from(ev)
    .where(and(eq(ev.hotelId, hotelId), gte(ev.day, since)))
    .groupBy(ev.type);
  const by = Object.fromEntries(rows.map((r) => [r.type, r])) as Record<string, { n: number; visitors: number } | undefined>;
  const leads = (by.enquiry?.n ?? 0) + (by.booking_request?.n ?? 0);
  const visitors = by.page_view?.visitors ?? 0;
  return {
    pageViews: by.page_view?.n ?? 0,
    visitors,
    ctaClicks: by.cta_click?.n ?? 0,
    enquiries: by.enquiry?.n ?? 0,
    bookingRequests: by.booking_request?.n ?? 0,
    leads,
    conversion: visitors ? leads / visitors : 0,
  };
}

export async function dailySeries(hotelId: string, days = 30) {
  const db = await getDb();
  const since = daysAgo(days - 1);
  const rows = await db
    .select({
      day: ev.day,
      views: sql<number>`count(*) filter (where ${ev.type} = 'page_view')`.mapWith(Number),
      leads: sql<number>`count(*) filter (where ${ev.type} in ('enquiry','booking_request'))`.mapWith(Number),
    })
    .from(ev)
    .where(and(eq(ev.hotelId, hotelId), gte(ev.day, since)))
    .groupBy(ev.day);
  const map = new Map(rows.map((r) => [r.day, r]));
  return Array.from({ length: days }, (_, i) => {
    const day = daysAgo(days - 1 - i);
    return { day, views: map.get(day)?.views ?? 0, leads: map.get(day)?.leads ?? 0 };
  });
}

export async function topBreakdown(hotelId: string, column: "path" | "cta" | "referrer" | "utmSource" | "device", type: schema.AnalyticsType, days = 30, limit = 8) {
  const db = await getDb();
  const col = ev[column];
  return db
    .select({ key: col, n: count() })
    .from(ev)
    .where(and(eq(ev.hotelId, hotelId), eq(ev.type, type), gte(ev.day, daysAgo(days - 1)), sql`${col} is not null`))
    .groupBy(col)
    .orderBy(desc(count()))
    .limit(limit);
}
