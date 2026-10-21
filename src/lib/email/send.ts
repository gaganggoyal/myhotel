import { and, count, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { EmailStream } from "@/db/schema";
import { appUrl, config } from "../config";
import { parseContent, type SiteContent } from "../content";
import { getTemplate, type Vars } from "./catalog";
import { deliver } from "./providers";
import { renderEmail, type Brand } from "./render";

const { emailMessages, emailSuppressions, hotels, siteDrafts, siteVersions, emailTemplates, memberships, users } = schema;

/** Fair-use cap on guest-facing mail per hotel per day; protects the shared sending domain. */
const HOTEL_DAILY_GUEST_LIMIT = 300;

function quoteName(name: string): string {
  return `"${name.replace(/["\\\r\n<>]/g, "").slice(0, 70)}"`;
}

type SendInput = {
  hotelId: string | null;
  stream: EmailStream;
  templateKey: string;
  to: string;
  fromName: string;
  fromLocal: string;
  replyTo: string | null;
  subject: string;
  html: string;
  text: string;
};

/** Core send: suppression → pause/limits → outbox row → provider. Never throws for delivery errors. */
export async function sendEmail(input: SendInput): Promise<{ id: string; status: schema.EmailStatus }> {
  const db = await getDb();
  const to = input.to.trim().toLowerCase();
  const from = `${quoteName(input.fromName)} <${input.fromLocal}@${config.email.fromDomain}>`;
  const base = {
    hotelId: input.hotelId,
    stream: input.stream,
    templateKey: input.templateKey,
    toEmail: to,
    fromEmail: from,
    replyTo: input.replyTo,
    subject: input.subject,
    html: input.html,
    text: input.text,
    provider: config.email.provider,
  };

  const scope = input.stream === "platform" ? "platform" : (input.hotelId ?? "platform");
  const suppressed = await db
    .select({ id: emailSuppressions.id })
    .from(emailSuppressions)
    .where(and(eq(emailSuppressions.scope, scope), eq(emailSuppressions.email, to)))
    .limit(1);
  if (suppressed.length) {
    const [row] = await db.insert(emailMessages).values({ ...base, status: "suppressed", error: "Address suppressed after a bounce or complaint" }).returning({ id: emailMessages.id });
    return { id: row.id, status: "suppressed" };
  }

  if (input.stream === "hotel_guest" && input.hotelId) {
    const [hotel] = await db.select({ mailPausedAt: hotels.mailPausedAt }).from(hotels).where(eq(hotels.id, input.hotelId));
    let pauseReason: string | null = hotel?.mailPausedAt ? "Guest email is paused for this property" : null;
    if (!pauseReason) {
      const [{ n }] = await db
        .select({ n: count() })
        .from(emailMessages)
        .where(and(eq(emailMessages.hotelId, input.hotelId), eq(emailMessages.stream, "hotel_guest"), gte(emailMessages.createdAt, new Date(Date.now() - 86_400_000))));
      if (n >= HOTEL_DAILY_GUEST_LIMIT) pauseReason = "Daily guest email limit reached";
    }
    if (pauseReason) {
      const [row] = await db.insert(emailMessages).values({ ...base, status: "paused", error: pauseReason }).returning({ id: emailMessages.id });
      return { id: row.id, status: "paused" };
    }
  }

  const [row] = await db.insert(emailMessages).values({ ...base, status: "queued" }).returning({ id: emailMessages.id });
  return attemptDelivery(row.id);
}

export async function attemptDelivery(messageId: string): Promise<{ id: string; status: schema.EmailStatus }> {
  const db = await getDb();
  const [m] = await db.select().from(emailMessages).where(eq(emailMessages.id, messageId));
  if (!m) throw new Error("message not found");
  const result = await deliver({
    id: m.id,
    hotelId: m.hotelId,
    stream: m.stream,
    from: m.fromEmail,
    to: m.toEmail,
    replyTo: m.replyTo,
    subject: m.subject,
    html: m.html,
    text: m.text,
  });
  const attempts = m.attempts + 1;
  if (result.ok) {
    await db.update(emailMessages).set({ status: "sent", providerMessageId: result.providerMessageId, attempts, sentAt: new Date(), error: null, nextAttemptAt: null }).where(eq(emailMessages.id, m.id));
    return { id: m.id, status: "sent" };
  }
  const retry = result.retryable && attempts < 5;
  await db
    .update(emailMessages)
    .set({ status: "failed", error: result.error, attempts, nextAttemptAt: retry ? new Date(Date.now() + 2 ** attempts * 60_000) : null })
    .where(eq(emailMessages.id, m.id));
  console.error(`[email] delivery failed for ${m.id}: ${result.error}`);
  return { id: m.id, status: "failed" };
}

export async function retryFailedEmails(): Promise<number> {
  const db = await getDb();
  const due = await db
    .select({ id: emailMessages.id })
    .from(emailMessages)
    .where(and(eq(emailMessages.status, "failed"), lte(emailMessages.nextAttemptAt, new Date())))
    .limit(50);
  for (const m of due) await attemptDelivery(m.id);
  return due.length;
}

// ---------------------------------------------------------------------------
// Hotel and platform helpers
// ---------------------------------------------------------------------------

async function hotelContent(hotelId: string): Promise<{ hotel: typeof hotels.$inferSelect; content: SiteContent }> {
  const db = await getDb();
  const [hotel] = await db.select().from(hotels).where(eq(hotels.id, hotelId));
  if (!hotel) throw new Error("hotel not found");
  let raw: unknown = null;
  if (hotel.publishedVersionId) {
    const [v] = await db.select({ content: siteVersions.content }).from(siteVersions).where(eq(siteVersions.id, hotel.publishedVersionId));
    raw = v?.content;
  }
  if (!raw) {
    const [d] = await db.select({ content: siteDrafts.content }).from(siteDrafts).where(eq(siteDrafts.hotelId, hotelId));
    raw = d?.content;
  }
  return { hotel, content: parseContent(raw) };
}

/** The verified address owner notifications and guest replies go to. Falls back to the owner's login email. */
export async function hotelInbox(hotelId: string): Promise<string> {
  const db = await getDb();
  const [hotel] = await db.select().from(hotels).where(eq(hotels.id, hotelId));
  if (hotel?.replyToEmail && hotel.replyToVerifiedAt) return hotel.replyToEmail;
  const [owner] = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.hotelId, hotelId), eq(memberships.role, "owner")))
    .limit(1);
  return owner?.email ?? config.email.support;
}

export function addressLine(c: SiteContent): string {
  const a = c.contact.address;
  return [a.line1, a.line2, a.locality, a.city, a.state && a.postalCode ? `${a.state} ${a.postalCode}` : a.state || a.postalCode]
    .filter(Boolean)
    .join(", ");
}

export function hotelBrand(content: SiteContent): Brand {
  const name = content.property.name;
  return {
    name,
    color: content.theme.primary,
    footer: [
      `Sent by ${config.platformName} on behalf of ${name}. Reply to this email to reach ${name} directly.`,
      addressLine(content),
      content.contact.phone ? `Phone: ${content.contact.phone}` : "",
    ].filter(Boolean),
  };
}

export function platformBrand(): Brand {
  return {
    name: config.platformName,
    color: "#0f172a",
    footer: [`${config.platformName} · Websites for independent hotels`, `Questions? Write to ${config.email.support}`],
  };
}

/** Sends a hotel template using the owner's edited copy (if any) and the hotel's branding. */
export async function sendHotelEmail(input: { hotelId: string; key: string; to: string; vars: Vars }) {
  const def = getTemplate(input.key);
  const db = await getDb();
  const { hotel, content } = await hotelContent(input.hotelId);
  const [override] = def.editable
    ? await db.select().from(emailTemplates).where(and(eq(emailTemplates.hotelId, input.hotelId), eq(emailTemplates.key, input.key)))
    : [];
  const vars: Vars = {
    platform_name: config.platformName,
    property_name: content.property.name,
    property_phone: content.contact.phone || content.contact.whatsapp,
    property_address: addressLine(content),
    ...input.vars,
  };
  const rendered = renderEmail(def, { subject: override?.subject ?? def.subject, body: override?.body ?? def.body }, vars, hotelBrand(content));
  const inbox = await hotelInbox(input.hotelId);
  // Guest mail: Reply-To is the hotel. Owner notifications: Reply-To is the guest, so a
  // reply from the owner's inbox goes straight to the guest from the owner's own identity.
  const replyTo = def.stream === "hotel_owner" ? (input.vars.guest_email ?? null) : inbox;
  return sendEmail({
    hotelId: input.hotelId,
    stream: def.stream,
    templateKey: def.key,
    to: input.to,
    fromName: `${content.property.name} via ${config.platformName}`,
    fromLocal: hotel.slug,
    replyTo,
    ...rendered,
  });
}

export async function sendPlatformEmail(input: { to: string; key: string; vars: Vars; hotelId?: string | null }) {
  const def = getTemplate(input.key);
  const vars: Vars = { platform_name: config.platformName, support_email: config.email.support, dashboard_link: appUrl("/dashboard"), billing_link: appUrl("/dashboard/billing"), ...input.vars };
  const rendered = renderEmail(def, { subject: def.subject, body: def.body }, vars, platformBrand());
  const local = config.email.platformFrom.split("@")[0] || "hello";
  return sendEmail({
    hotelId: input.hotelId ?? null,
    stream: "platform",
    templateKey: def.key,
    to: input.to,
    fromName: config.platformName,
    fromLocal: local,
    replyTo: config.email.support,
    ...rendered,
  });
}

// ---------------------------------------------------------------------------
// Reputation: per-hotel suppression and automatic pause
// ---------------------------------------------------------------------------

/** Thresholds sit well under Gmail's 0.3% spam-rate line (target < 0.1%). */
const REPUTATION = { windowDays: 30, maxComplaints: 3, complaintRate: 0.001, minVolumeForRate: 500, bounceRate: 0.08, minVolumeForBounce: 40 };

export async function recordDeliveryEvent(input: { providerMessageId: string; event: "delivered" | "bounced" | "complained"; email?: string; detail?: string }) {
  const db = await getDb();
  const [m] = await db.select().from(emailMessages).where(eq(emailMessages.providerMessageId, input.providerMessageId)).limit(1);
  if (!m) return;
  if (input.event === "delivered") {
    if (m.status === "sent") await db.update(emailMessages).set({ status: "delivered" }).where(eq(emailMessages.id, m.id));
    return;
  }
  await db.update(emailMessages).set({ status: input.event, error: input.detail ?? null }).where(eq(emailMessages.id, m.id));
  const scope = m.stream === "platform" ? "platform" : (m.hotelId ?? "platform");
  await db
    .insert(emailSuppressions)
    .values({ scope, email: (input.email ?? m.toEmail).toLowerCase(), reason: input.event })
    .onConflictDoNothing();
  if (m.hotelId && m.stream !== "platform") await evaluateHotelReputation(m.hotelId);
}

export async function evaluateHotelReputation(hotelId: string): Promise<string | null> {
  const db = await getDb();
  const since = new Date(Date.now() - REPUTATION.windowDays * 86_400_000);
  const rows = await db
    .select({ status: emailMessages.status, n: count() })
    .from(emailMessages)
    .where(and(eq(emailMessages.hotelId, hotelId), inArray(emailMessages.stream, ["hotel_guest"]), gte(emailMessages.createdAt, since)))
    .groupBy(emailMessages.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Record<string, number>;
  const sent = (by.sent ?? 0) + (by.delivered ?? 0) + (by.bounced ?? 0) + (by.complained ?? 0);
  const complaints = by.complained ?? 0;
  const bounces = by.bounced ?? 0;
  let reason: string | null = null;
  if (complaints >= REPUTATION.maxComplaints) reason = `${complaints} spam complaints in ${REPUTATION.windowDays} days`;
  else if (sent >= REPUTATION.minVolumeForRate && complaints / sent >= REPUTATION.complaintRate) reason = `Complaint rate ${((complaints / sent) * 100).toFixed(2)}%`;
  else if (sent >= REPUTATION.minVolumeForBounce && bounces / sent >= REPUTATION.bounceRate) reason = `Bounce rate ${((bounces / sent) * 100).toFixed(1)}%`;
  if (reason) {
    await db
      .update(hotels)
      .set({ mailPausedAt: sql`coalesce(${hotels.mailPausedAt}, now())`, mailPauseReason: reason })
      .where(eq(hotels.id, hotelId));
  }
  return reason;
}
