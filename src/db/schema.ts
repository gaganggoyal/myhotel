import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  emailVerifiedAt: ts("email_verified_at"),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  lastLoginAt: ts("last_login_at"),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 of the cookie token; the raw token is never stored */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Single-use tokens: email verification, password reset, reply-to verification. */
export const authTokens = pgTable("auth_tokens", {
  id: id(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  hotelId: text("hotel_id"),
  purpose: text("purpose").$type<"verify_email" | "reset_password" | "verify_reply_to">().notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  data: jsonb("data").$type<Record<string, string>>(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------

export type SiteStatus = "draft" | "live" | "unpublished";

export const hotels = pgTable("hotels", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  siteStatus: text("site_status").$type<SiteStatus>().notNull().default("draft"),
  publishedVersionId: text("published_version_id"),
  /** Set by platform staff (abuse, impersonation). Overrides everything else. */
  adminSuspendedAt: ts("admin_suspended_at"),
  adminSuspendReason: text("admin_suspend_reason"),
  /** Where guest replies and owner notifications go. Must be verified before use. */
  replyToEmail: text("reply_to_email"),
  replyToVerifiedAt: ts("reply_to_verified_at"),
  /** Guest-facing mail paused for reputation reasons (auto or by staff). */
  mailPausedAt: ts("mail_paused_at"),
  mailPauseReason: text("mail_pause_reason"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type Role = "owner" | "manager" | "front_desk";

export const memberships = pgTable(
  "memberships",
  {
    hotelId: text("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<Role>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.hotelId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

/** Retired slugs keep redirecting to the hotel and are never reissued to another property. */
export const slugHistory = pgTable("slug_history", {
  slug: text("slug").primaryKey(),
  hotelId: text("hotel_id")
    .notNull()
    .references(() => hotels.id, { onDelete: "cascade" }),
  retiredAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Website content: one editable draft, immutable published snapshots
// ---------------------------------------------------------------------------

export const siteDrafts = pgTable("site_drafts", {
  hotelId: text("hotel_id")
    .primaryKey()
    .references(() => hotels.id, { onDelete: "cascade" }),
  content: jsonb("content").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedBy: text("updated_by"),
  updatedAt: updatedAt(),
});

export const siteVersions = pgTable(
  "site_versions",
  {
    id: id(),
    hotelId: text("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: jsonb("content").notNull(),
    note: text("note"),
    publishedBy: text("published_by"),
    publishedAt: createdAt(),
  },
  (t) => [uniqueIndex("site_versions_hotel_version_idx").on(t.hotelId, t.version)],
);

export type MediaKind = "photo" | "logo" | "qr" | "payment_proof";

export const media = pgTable(
  "media",
  {
    id: id(),
    hotelId: text("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    kind: text("kind").$type<MediaKind>().notNull(),
    mime: text("mime").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    alt: text("alt").notNull().default(""),
    /** Derivative names stored next to each other, e.g. ["480", "960", "1600"] or ["qr"] */
    variants: jsonb("variants").$type<string[]>().notNull(),
    /** Public media is served at /media/...; private media only through authorised routes. */
    isPublic: boolean("is_public").notNull().default(true),
    deletedAt: ts("deleted_at"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("media_hotel_idx").on(t.hotelId)],
);

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

export type DomainStatus =
  | "pending_dns"
  | "wrong_record"
  | "ownership_required"
  | "provisioning_certificate"
  | "active"
  | "disconnected"
  | "blocked";

export type DnsRecord = { type: "CNAME" | "A" | "AAAA" | "TXT"; name: string; value: string };

export const domains = pgTable(
  "domains",
  {
    id: id(),
    hotelId: text("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull().unique(),
    status: text("status").$type<DomainStatus>().notNull().default("pending_dns"),
    provider: text("provider").$type<"manual" | "cloudflare" | "vercel">().notNull(),
    providerRef: text("provider_ref"),
    isPrimary: boolean("is_primary").notNull().default(true),
    /** Records the owner must create, as shown in the dashboard. */
    expected: jsonb("expected").$type<DnsRecord[]>().notNull(),
    /** What our resolver saw on the last check. */
    observed: jsonb("observed").$type<DnsRecord[]>().notNull().default([]),
    issues: jsonb("issues").$type<string[]>().notNull().default([]),
    lastCheckedAt: ts("last_checked_at"),
    activatedAt: ts("activated_at"),
    disconnectedAt: ts("disconnected_at"),
    createdAt: createdAt(),
  },
  (t) => [index("domains_hotel_idx").on(t.hotelId)],
);

// ---------------------------------------------------------------------------
// Guest payments: the hotel's own UPI details; the platform never holds money
// ---------------------------------------------------------------------------

export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: id(),
    hotelId: text("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    scheme: text("scheme").$type<"upi">().notNull().default("upi"),
    /** Bank-registered beneficiary name, which is what the guest's UPI app will show. */
    payeeName: text("payee_name").notNull(),
    vpa: text("vpa").notNull(),
    note: text("note"),
    qrMediaId: text("qr_media_id"),
    /** Payload decoded from the uploaded QR, if any, for the consistency check. */
    qrDecoded: text("qr_decoded"),
    qrWarning: text("qr_warning"),
    attestedAt: ts("attested_at").notNull(),
    attestedBy: text("attested_by").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("payment_methods_hotel_scheme_idx").on(t.hotelId, t.scheme)],
);

// ---------------------------------------------------------------------------
// Leads, reservations and payment requests
// ---------------------------------------------------------------------------

export type EnquiryKind = "enquiry" | "booking_request";
export type EnquiryStatus = "new" | "contacted" | "quoted" | "won" | "lost" | "spam";

export const enquiries = pgTable(
  "enquiries",
  {
    id: id(),
    hotelId: text("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    ref: text("ref").notNull().unique(),
    kind: text("kind").$type<EnquiryKind>().notNull(),
    status: text("status").$type<EnquiryStatus>().notNull().default("new"),
    guestName: text("guest_name").notNull(),
    guestEmail: text("guest_email").notNull(),
    guestPhone: text("guest_phone").notNull(),
    checkIn: date("check_in", { mode: "string" }),
    checkOut: date("check_out", { mode: "string" }),
    adults: integer("adults").notNull().default(2),
    children: integer("children").notNull().default(0),
    roomId: text("room_id"),
    roomName: text("room_name"),
    message: text("message"),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    source: jsonb("source").$type<{ path?: string; cta?: string; referrer?: string; utm?: Record<string, string> }>(),
    ownerNotes: text("owner_notes"),
    reservationId: text("reservation_id"),
    anonymizedAt: ts("anonymized_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("enquiries_hotel_created_idx").on(t.hotelId, t.createdAt)],
);

export type ReservationStatus = "pending" | "confirmed" | "cancelled" | "completed";

export const reservations = pgTable(
  "reservations",
  {
    id: id(),
    hotelId: text("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    ref: text("ref").notNull().unique(),
    enquiryId: text("enquiry_id"),
    status: text("status").$type<ReservationStatus>().notNull().default("pending"),
    guestName: text("guest_name").notNull(),
    guestEmail: text("guest_email").notNull(),
    guestPhone: text("guest_phone").notNull(),
    checkIn: date("check_in", { mode: "string" }).notNull(),
    checkOut: date("check_out", { mode: "string" }).notNull(),
    adults: integer("adults").notNull().default(2),
    children: integer("children").notNull().default(0),
    roomName: text("room_name").notNull(),
    /** Integer paise. */
    totalAmount: integer("total_amount").notNull(),
    currency: text("currency").notNull().default("INR"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("reservations_hotel_idx").on(t.hotelId, t.checkIn)],
);

export const reservationEvents = pgTable(
  "reservation_events",
  {
    id: id(),
    hotelId: text("hotel_id").notNull(),
    reservationId: text("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    actorUserId: text("actor_user_id"),
    actorLabel: text("actor_label"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("reservation_events_res_idx").on(t.reservationId)],
);

/**
 * Payment states. Only "paid" (set by hotel staff after seeing the credit in their own bank
 * or UPI app) reduces the balance. A guest report is a message, not a settlement.
 */
export type PaymentRequestStatus = "unpaid" | "guest_reported" | "paid" | "needs_review" | "rejected" | "cancelled";

export type PayeeSnapshot = { payeeName: string; vpa: string; qrMediaId: string | null; note: string | null };

export const paymentRequests = pgTable(
  "payment_requests",
  {
    id: id(),
    hotelId: text("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    reservationId: text("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "cascade" }),
    /** Unguessable capability token for the guest's payment page. */
    token: text("token").notNull().unique(),
    amount: integer("amount").notNull(),
    purpose: text("purpose").$type<"deposit" | "balance" | "full">().notNull(),
    status: text("status").$type<PaymentRequestStatus>().notNull().default("unpaid"),
    /** Payee details frozen when the request is issued; later edits don't alter a sent link. */
    payee: jsonb("payee").$type<PayeeSnapshot>().notNull(),
    expiresAt: ts("expires_at").notNull(),
    guestReportedAt: ts("guest_reported_at"),
    guestUtr: text("guest_utr"),
    guestProofMediaId: text("guest_proof_media_id"),
    guestNote: text("guest_note"),
    resolvedAt: ts("resolved_at"),
    resolvedBy: text("resolved_by"),
    resolutionNote: text("resolution_note"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("payment_requests_res_idx").on(t.reservationId)],
);

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export type EmailStream = "platform" | "hotel_guest" | "hotel_owner";
export type EmailStatus = "queued" | "sent" | "failed" | "suppressed" | "paused" | "bounced" | "complained" | "delivered";

/** Owner-edited copy for hotel templates. Layout, facts and sender block stay locked. */
export const emailTemplates = pgTable(
  "email_templates",
  {
    hotelId: text("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    updatedBy: text("updated_by"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.hotelId, t.key] })],
);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: id(),
    hotelId: text("hotel_id"),
    stream: text("stream").$type<EmailStream>().notNull(),
    templateKey: text("template_key").notNull(),
    toEmail: text("to_email").notNull(),
    fromEmail: text("from_email").notNull(),
    replyTo: text("reply_to"),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    text: text("text").notNull(),
    status: text("status").$type<EmailStatus>().notNull().default("queued"),
    provider: text("provider").notNull(),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at"),
    sentAt: ts("sent_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("email_messages_hotel_idx").on(t.hotelId, t.createdAt),
    index("email_messages_provider_idx").on(t.providerMessageId),
  ],
);

/** Suppressions are scoped per hotel (or "platform") so one tenant's bounce never blocks another. */
export const emailSuppressions = pgTable(
  "email_suppressions",
  {
    id: id(),
    scope: text("scope").notNull(),
    email: text("email").notNull(),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("email_suppressions_scope_email_idx").on(t.scope, t.email)],
);

// ---------------------------------------------------------------------------
// Platform billing
// ---------------------------------------------------------------------------

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "grace_period" | "suspended" | "cancelled";

export const subscriptions = pgTable("subscriptions", {
  id: id(),
  hotelId: text("hotel_id")
    .notNull()
    .unique()
    .references(() => hotels.id, { onDelete: "cascade" }),
  planKey: text("plan_key").notNull(),
  interval: text("interval").$type<"monthly" | "yearly">().notNull().default("monthly"),
  status: text("status").$type<SubscriptionStatus>().notNull(),
  trialEndsAt: ts("trial_ends_at"),
  currentPeriodEnd: ts("current_period_end"),
  graceEndsAt: ts("grace_ends_at"),
  suspendedReason: text("suspended_reason"),
  provider: text("provider").$type<"simulated" | "razorpay" | "manual">().notNull().default("simulated"),
  providerSubscriptionId: text("provider_subscription_id").unique(),
  providerStatus: text("provider_status"),
  checkoutUrl: text("checkout_url"),
  cancelledAt: ts("cancelled_at"),
  trialReminderSentAt: ts("trial_reminder_sent_at"),
  /** Period end for which the pre-renewal warning was sent (one warning per period). */
  renewalReminderFor: ts("renewal_reminder_for"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const billingInvoices = pgTable("billing_invoices", {
  id: id(),
  hotelId: text("hotel_id")
    .notNull()
    .references(() => hotels.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerPaymentId: text("provider_payment_id").unique(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("INR"),
  periodEnd: ts("period_end"),
  createdAt: createdAt(),
});

/** Idempotency ledger for inbound webhooks (Razorpay, Resend, Postmark). */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: id(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload"),
    receivedAt: createdAt(),
  },
  (t) => [uniqueIndex("webhook_events_provider_event_idx").on(t.provider, t.eventId)],
);

// ---------------------------------------------------------------------------
// Analytics, audit, rate limiting
// ---------------------------------------------------------------------------

export type AnalyticsType = "page_view" | "cta_click" | "enquiry" | "booking_request";

/** Cookieless, first-party events. visitorHash rotates daily and cannot be reversed to an IP. */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    hotelId: text("hotel_id").notNull(),
    type: text("type").$type<AnalyticsType>().notNull(),
    path: text("path").notNull(),
    cta: text("cta"),
    referrer: text("referrer"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    device: text("device"),
    visitorHash: text("visitor_hash"),
    day: date("day", { mode: "string" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("analytics_hotel_day_idx").on(t.hotelId, t.day)],
);

/** Append-only. Application code never updates or deletes audit rows. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    hotelId: text("hotel_id"),
    actorUserId: text("actor_user_id"),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    ipHash: text("ip_hash"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_hotel_idx").on(t.hotelId, t.createdAt), index("audit_action_idx").on(t.action, t.createdAt)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: ts("reset_at").notNull(),
});
