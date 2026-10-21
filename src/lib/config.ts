// Central, typed view of environment configuration. Every value has a local default
// so `npm run dev` works with no .env file.

import { randomBytes } from "node:crypto";

const env = process.env;
const isProd = env.NODE_ENV === "production";

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// The development fallbacks below are public (this file is in the repo), so production never uses them.
function productionAppSecret(): string {
  console.warn("APP_SECRET is not set: using a random per-process secret. Form tokens will not survive restarts or work across instances.");
  return randomBytes(32).toString("hex");
}

const rootDomain = (env.ROOT_DOMAIN ?? "localhost:3000").toLowerCase();
const rootHostname = rootDomain.split(":")[0];

export const config = {
  isProd,
  platformName: env.PLATFORM_NAME ?? "MyHotel",
  /** host[:port] serving the marketing site and dashboard; hotels live at <slug>.<rootDomain> */
  rootDomain,
  rootHostname,
  protocol: env.APP_PROTOCOL ?? (isProd ? "https" : "http"),
  appSecret: env.APP_SECRET || (isProd ? productionAppSecret() : "dev-only-secret-change-me"),
  adminEmails: list(env.ADMIN_EMAILS ?? "admin@example.com"),
  /** empty in production when unset, which disables /api/cron/run */
  cronSecret: env.CRON_SECRET || (isProd ? "" : "dev-cron-secret"),

  storageDriver: (env.STORAGE_DRIVER ?? "local") as "local" | "s3",

  email: {
    provider: (env.EMAIL_PROVIDER ?? "console") as "console" | "resend" | "postmark",
    fromDomain: env.MAIL_FROM_DOMAIN ?? `mail.${rootHostname === "localhost" ? "myhotel.example" : rootHostname}`,
    platformFrom: env.PLATFORM_FROM_EMAIL ?? `hello@mail.${rootHostname === "localhost" ? "myhotel.example" : rootHostname}`,
    support: env.SUPPORT_EMAIL ?? `support@${rootHostname === "localhost" ? "myhotel.example" : rootHostname}`,
    resendKey: env.RESEND_API_KEY ?? "",
    resendWebhookSecret: env.RESEND_WEBHOOK_SECRET ?? "",
    postmarkToken: env.POSTMARK_SERVER_TOKEN ?? "",
    postmarkStream: env.POSTMARK_MESSAGE_STREAM ?? "outbound",
    postmarkWebhookAuth: env.POSTMARK_WEBHOOK_AUTH ?? "",
  },

  domains: {
    provider: (env.DOMAIN_PROVIDER ?? "manual") as "manual" | "cloudflare" | "vercel",
    cnameTarget: (env.CNAME_TARGET ?? `sites.${rootHostname === "localhost" ? "myhotel.example" : rootHostname}`).toLowerCase(),
    cloudflareToken: env.CLOUDFLARE_API_TOKEN ?? "",
    cloudflareZoneId: env.CLOUDFLARE_ZONE_ID ?? "",
    vercelToken: env.VERCEL_API_TOKEN ?? "",
    vercelProjectId: env.VERCEL_PROJECT_ID ?? "",
    vercelTeamId: env.VERCEL_TEAM_ID ?? "",
  },

  billing: {
    provider: (env.BILLING_PROVIDER ?? "simulated") as "simulated" | "razorpay",
    razorpayKeyId: env.RAZORPAY_KEY_ID ?? "",
    razorpayKeySecret: env.RAZORPAY_KEY_SECRET ?? "",
    razorpayWebhookSecret: env.RAZORPAY_WEBHOOK_SECRET ?? "",
    razorpayPlanMonthly: env.RAZORPAY_PLAN_MONTHLY ?? "",
    razorpayPlanYearly: env.RAZORPAY_PLAN_YEARLY ?? "",
  },

  turnstile: {
    siteKey: env.TURNSTILE_SITE_KEY ?? "",
    secretKey: env.TURNSTILE_SECRET_KEY ?? "",
  },
} as const;

export function appUrl(path = "/"): string {
  return `${config.protocol}://${config.rootDomain}${path}`;
}

export function siteOrigin(host: string): string {
  return `${config.protocol}://${host}`;
}

export function subdomainHost(slug: string): string {
  return `${slug}.${config.rootDomain}`;
}
