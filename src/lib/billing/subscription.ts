import { and, eq, isNull, lt, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { SubscriptionStatus } from "@/db/schema";
import { audit, SYSTEM_ACTOR } from "../audit";
import { formatDate, formatINR } from "../format";
import { sendPlatformEmail } from "../email/send";
import { getPlan, priceWithGst } from "./plans";
import { hotelIdFromNotes, type RazorpayWebhook } from "./razorpay";

const { subscriptions, hotels, memberships, users, billingInvoices } = schema;

type Subscription = typeof subscriptions.$inferSelect;

export const GRACE_DAYS = 7;

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment retrying",
  grace_period: "Grace period",
  suspended: "Suspended",
  cancelled: "Cancelled",
};

/**
 * Whether the public website is served. Grace and retry periods keep the site online; a
 * cancelled plan runs to the end of the paid period. Suspension never deletes content.
 */
export function subscriptionServesSite(sub: Pick<Subscription, "status" | "trialEndsAt" | "currentPeriodEnd" | "graceEndsAt"> | null, now = new Date()): boolean {
  if (!sub) return false;
  switch (sub.status) {
    case "trialing":
      return !sub.trialEndsAt || sub.trialEndsAt > now;
    case "active":
    case "past_due":
      return true;
    case "grace_period":
      return !sub.graceEndsAt || sub.graceEndsAt > now;
    case "cancelled":
      return Boolean(sub.currentPeriodEnd && sub.currentPeriodEnd > now);
    default:
      return false;
  }
}

/** Custom domains need a paid plan: trial sites stay on the platform subdomain. */
export function subscriptionAllowsCustomDomain(sub: Pick<Subscription, "status"> | null): boolean {
  return Boolean(sub && ["active", "past_due", "grace_period"].includes(sub.status));
}

export async function getSubscription(hotelId: string): Promise<Subscription | null> {
  const db = await getDb();
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.hotelId, hotelId));
  return sub ?? null;
}

export async function startTrial(hotelId: string, planKey = "website"): Promise<Subscription> {
  const db = await getDb();
  const plan = getPlan(planKey);
  const [sub] = await db
    .insert(subscriptions)
    .values({ hotelId, planKey: plan.key, status: "trialing", trialEndsAt: new Date(Date.now() + plan.trialDays * 86_400_000) })
    .returning();
  return sub;
}

async function ownerOf(hotelId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ email: users.email, name: users.name, hotelName: hotels.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(hotels, eq(hotels.id, memberships.hotelId))
    .where(and(eq(memberships.hotelId, hotelId), eq(memberships.role, "owner")))
    .limit(1);
  return row ?? null;
}

function addInterval(from: Date, interval: "monthly" | "yearly"): Date {
  const d = new Date(from);
  if (interval === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

/** Simulated billing for development and for staff-managed (offline/invoice) accounts. */
export async function activateManually(hotelId: string, interval: "monthly" | "yearly", provider: "simulated" | "manual"): Promise<void> {
  const db = await getDb();
  const sub = await getSubscription(hotelId);
  const start = sub?.currentPeriodEnd && sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd : new Date();
  const periodEnd = addInterval(start, interval);
  await db
    .update(subscriptions)
    .set({ status: "active", interval, provider, currentPeriodEnd: periodEnd, graceEndsAt: null, suspendedReason: null, cancelledAt: null, updatedAt: new Date() })
    .where(eq(subscriptions.hotelId, hotelId));
  const plan = getPlan(sub?.planKey);
  await db.insert(billingInvoices).values({ hotelId, provider, amount: priceWithGst(plan.prices[interval], plan.gstRate), periodEnd });
  await audit(hotelId, SYSTEM_ACTOR, "subscription.activated", { provider, interval, periodEnd });
  const owner = await ownerOf(hotelId);
  if (owner) {
    await sendPlatformEmail({
      to: owner.email,
      key: "subscription_active",
      hotelId,
      vars: { owner_name: owner.name, property_name: owner.hotelName, plan_name: plan.name, interval, period_end: formatDate(periodEnd) },
    });
  }
}

/** Applies a verified Razorpay webhook. Idempotency is handled by the caller. */
export async function applyRazorpayEvent(evt: RazorpayWebhook): Promise<string> {
  const entity = evt.payload.subscription?.entity;
  if (!entity) return "ignored: no subscription entity";
  const db = await getDb();
  let [sub] = await db.select().from(subscriptions).where(eq(subscriptions.providerSubscriptionId, entity.id));
  if (!sub) {
    const hotelId = hotelIdFromNotes(entity.notes);
    if (!hotelId) return "ignored: unknown subscription";
    [sub] = await db.select().from(subscriptions).where(eq(subscriptions.hotelId, hotelId));
    if (!sub) return "ignored: no local subscription";
  }
  const now = new Date();
  const periodEnd = entity.current_end ? new Date(entity.current_end * 1000) : sub.currentPeriodEnd;
  const owner = await ownerOf(sub.hotelId);
  const patch: Partial<Subscription> = { providerStatus: entity.status, providerSubscriptionId: entity.id, provider: "razorpay", updatedAt: now };

  switch (evt.event) {
    case "subscription.activated":
    case "subscription.charged":
    case "subscription.resumed":
      Object.assign(patch, { status: "active", currentPeriodEnd: periodEnd, graceEndsAt: null, suspendedReason: null });
      if (evt.event === "subscription.charged" && evt.payload.payment?.entity) {
        const p = evt.payload.payment.entity;
        await db.insert(billingInvoices).values({ hotelId: sub.hotelId, provider: "razorpay", providerPaymentId: p.id, amount: p.amount, currency: p.currency, periodEnd }).onConflictDoNothing();
      }
      if (sub.status !== "active" && owner) {
        const plan = getPlan(sub.planKey);
        await sendPlatformEmail({ to: owner.email, key: "subscription_active", hotelId: sub.hotelId, vars: { owner_name: owner.name, property_name: owner.hotelName, plan_name: plan.name, interval: sub.interval, period_end: formatDate(periodEnd) } });
      }
      break;
    case "subscription.pending":
      // Razorpay is retrying the charge. Site stays online; owner is warned once.
      Object.assign(patch, { status: "past_due" });
      if (sub.status !== "past_due" && owner) await sendPlatformEmail({ to: owner.email, key: "payment_failed", hotelId: sub.hotelId, vars: { owner_name: owner.name, property_name: owner.hotelName } });
      break;
    case "subscription.halted":
      // All retries failed: 7-day grace, then suspension by the daily job.
      Object.assign(patch, { status: "grace_period", graceEndsAt: new Date(now.getTime() + GRACE_DAYS * 86_400_000) });
      break;
    case "subscription.cancelled":
    case "subscription.completed":
      Object.assign(patch, { status: "cancelled", cancelledAt: now, currentPeriodEnd: periodEnd });
      break;
    case "subscription.paused":
      Object.assign(patch, { status: "suspended", suspendedReason: "Subscription paused" });
      break;
    default:
      return `ignored: ${evt.event}`;
  }
  await db.update(subscriptions).set(patch).where(eq(subscriptions.id, sub.id));
  await audit(sub.hotelId, SYSTEM_ACTOR, `billing.${evt.event}`, { status: patch.status, providerStatus: entity.status });
  return `applied ${evt.event} → ${patch.status}`;
}

/** Daily job: trial reminders, trial expiry, grace expiry, annual renewal warnings. */
export async function runBillingJobs(now = new Date()): Promise<Record<string, number>> {
  const db = await getDb();
  const stats = { trialReminders: 0, trialsEnded: 0, graceEnded: 0, cancelledEnded: 0, renewalReminders: 0 };

  const trials = await db.select().from(subscriptions).where(eq(subscriptions.status, "trialing"));
  for (const sub of trials) {
    const owner = await ownerOf(sub.hotelId);
    if (!sub.trialEndsAt) continue;
    const msLeft = sub.trialEndsAt.getTime() - now.getTime();
    if (msLeft <= 0) {
      await db.update(subscriptions).set({ status: "suspended", suspendedReason: "Trial ended", updatedAt: now }).where(eq(subscriptions.id, sub.id));
      await audit(sub.hotelId, SYSTEM_ACTOR, "billing.trial_ended");
      if (owner) await sendPlatformEmail({ to: owner.email, key: "site_offline", hotelId: sub.hotelId, vars: { owner_name: owner.name, property_name: owner.hotelName, reason: "Your free trial has ended, so your website is showing a maintenance page." } });
      stats.trialsEnded++;
    } else if (msLeft <= 3 * 86_400_000 && !sub.trialReminderSentAt) {
      await db.update(subscriptions).set({ trialReminderSentAt: now }).where(eq(subscriptions.id, sub.id));
      if (owner) await sendPlatformEmail({ to: owner.email, key: "trial_ending", hotelId: sub.hotelId, vars: { owner_name: owner.name, property_name: owner.hotelName, trial_end: formatDate(sub.trialEndsAt) } });
      stats.trialReminders++;
    }
  }

  const graceExpired = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.status, "grace_period"), lt(subscriptions.graceEndsAt, now)));
  for (const sub of graceExpired) {
    await db.update(subscriptions).set({ status: "suspended", suspendedReason: "Renewal payment not received", updatedAt: now }).where(eq(subscriptions.id, sub.id));
    await audit(sub.hotelId, SYSTEM_ACTOR, "billing.grace_ended");
    const owner = await ownerOf(sub.hotelId);
    if (owner) await sendPlatformEmail({ to: owner.email, key: "site_offline", hotelId: sub.hotelId, vars: { owner_name: owner.name, property_name: owner.hotelName, reason: "We could not collect your renewal payment, so your website is showing a maintenance page." } });
    stats.graceEnded++;
  }

  const cancelledEnded = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.status, "cancelled"), lt(subscriptions.currentPeriodEnd, now)));
  for (const sub of cancelledEnded) {
    await db.update(subscriptions).set({ status: "suspended", suspendedReason: "Subscription cancelled", updatedAt: now }).where(eq(subscriptions.id, sub.id));
    stats.cancelledEnded++;
  }

  // Annual renewals: warn 7 days ahead, once per period. (A documented complaint about
  // competitors is annual plans renewing without warning.)
  const soon = new Date(now.getTime() + 7 * 86_400_000);
  const yearly = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "active"),
        eq(subscriptions.interval, "yearly"),
        lt(subscriptions.currentPeriodEnd, soon),
        or(isNull(subscriptions.renewalReminderFor), lt(subscriptions.renewalReminderFor, subscriptions.currentPeriodEnd)),
      ),
    );
  for (const sub of yearly) {
    if (!sub.currentPeriodEnd || sub.currentPeriodEnd < now) continue;
    await db.update(subscriptions).set({ renewalReminderFor: sub.currentPeriodEnd }).where(eq(subscriptions.id, sub.id));
    const owner = await ownerOf(sub.hotelId);
    const plan = getPlan(sub.planKey);
    if (owner)
      await sendPlatformEmail({
        to: owner.email,
        key: "renewal_reminder",
        hotelId: sub.hotelId,
        vars: { owner_name: owner.name, property_name: owner.hotelName, period_end: formatDate(sub.currentPeriodEnd), amount: `${formatINR(priceWithGst(plan.prices.yearly, plan.gstRate))} incl. GST` },
      });
    stats.renewalReminders++;
  }
  return stats;
}
