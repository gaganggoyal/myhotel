import { and, isNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { runBillingJobs } from "./billing/subscription";
import { runDomainJobs } from "./domains/service";
import { retryFailedEmails } from "./email/send";
import { purgeExpiredRateLimits } from "./ratelimit";

/** Enquiries that never became bookings are anonymised after this many months. */
export const ENQUIRY_RETENTION_MONTHS = 24;

export async function anonymiseOldEnquiries(now = new Date()): Promise<number> {
  const db = await getDb();
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - ENQUIRY_RETENTION_MONTHS);
  const rows = await db
    .update(schema.enquiries)
    .set({ guestName: "Deleted guest", guestEmail: "deleted@invalid", guestPhone: "", message: null, ownerNotes: null, source: null, anonymizedAt: now })
    .where(and(lt(schema.enquiries.createdAt, cutoff), isNull(schema.enquiries.anonymizedAt), isNull(schema.enquiries.reservationId)))
    .returning({ id: schema.enquiries.id });
  // Analytics rows older than 25 months are not needed for any report.
  await db.delete(schema.analyticsEvents).where(sql`${schema.analyticsEvents.createdAt} < now() - interval '25 months'`);
  return rows.length;
}

export type JobName = "billing" | "domains" | "email" | "retention" | "all";

export async function runJobs(task: JobName = "all"): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const run = async (name: Exclude<JobName, "all">, fn: () => Promise<unknown>) => {
    if (task !== "all" && task !== name) return;
    try {
      out[name] = await fn();
    } catch (err) {
      console.error(`[jobs] ${name} failed`, err);
      out[name] = { error: (err as Error).message };
    }
  };
  await run("billing", () => runBillingJobs());
  await run("domains", () => runDomainJobs());
  await run("email", () => retryFailedEmails());
  await run("retention", async () => {
    await purgeExpiredRateLimits();
    return { anonymised: await anonymiseOldEnquiries() };
  });
  return out;
}
