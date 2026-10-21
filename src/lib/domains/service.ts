import { and, eq, inArray, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { DnsRecord, DomainStatus } from "@/db/schema";
import { audit, SYSTEM_ACTOR, type AuditActor } from "../audit";
import { appUrl, config } from "../config";
import { sendPlatformEmail } from "../email/send";
import { isApexDomain, isValidHostname, registrableDomain } from "../hosts";
import { invalidateHotel } from "../site-cache";
import { checkDns } from "./dns";
import { domainProvider } from "./providers";

const { domains, memberships, users } = schema;
type Domain = typeof domains.$inferSelect;

export const DOMAIN_STATUS_COPY: Record<DomainStatus, { label: string; tone: "neutral" | "warn" | "good" | "bad"; help: string }> = {
  pending_dns: {
    label: "Waiting for DNS",
    tone: "neutral",
    help: "At your domain provider, add the record below. Most domains connect within a few hours; some take up to 48 hours.",
  },
  wrong_record: {
    label: "Record needs fixing",
    tone: "warn",
    help: "We found a record for this name, but it does not point to us yet. Compare what we see with what we expect below.",
  },
  ownership_required: {
    label: "Verify ownership",
    tone: "warn",
    help: "Add the TXT record below to prove you control this domain. Your site is not served on it until this passes.",
  },
  provisioning_certificate: {
    label: "Issuing certificate",
    tone: "neutral",
    help: "DNS is correct. The security certificate is being issued. You don’t need to do anything at your registrar.",
  },
  active: { label: "Connected", tone: "good", help: "Your website is live on this domain with HTTPS. It is your main address." },
  disconnected: {
    label: "Disconnected",
    tone: "bad",
    help: "This domain stopped pointing at your site. Visitors may see an error until you restore the record. Your subdomain is the main address again.",
  },
  blocked: {
    label: "Blocked",
    tone: "bad",
    help: "The certificate authority or our edge provider refused this domain. Contact support; retrying will not help.",
  },
};

/** Days a disconnected domain stays reserved before it is released. */
export const DISCONNECT_RELEASE_DAYS = 7;

export class DomainError extends Error {}

export function normalizeHostname(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

function expectedRecords(hostname: string, ownership: DnsRecord | null): DnsRecord[] {
  const records: DnsRecord[] = [{ type: "CNAME", name: hostname, value: config.domains.cnameTarget }];
  if (ownership) records.push(ownership);
  return records;
}

export async function connectDomain(hotelId: string, rawHostname: string, actor: AuditActor): Promise<Domain> {
  const hostname = normalizeHostname(rawHostname);
  if (!isValidHostname(hostname)) throw new DomainError("Enter a domain like www.yourhotel.com.");
  if (hostname === config.rootHostname || hostname.endsWith(`.${config.rootHostname}`) || registrableDomain(hostname) === registrableDomain(config.domains.cnameTarget)) {
    throw new DomainError(`Your ${config.platformName} subdomain is already connected. Enter a domain you own.`);
  }
  if (isApexDomain(hostname)) {
    throw new DomainError(
      `Use www.${hostname} (or another subdomain such as stay.${hostname}). A naked domain cannot hold the CNAME record we need; after www is connected you can forward ${hostname} to it at your registrar.`,
    );
  }
  const db = await getDb();
  const existing = await db.select().from(domains).where(eq(domains.hostname, hostname));
  if (existing[0] && existing[0].hotelId !== hotelId) {
    throw new DomainError("This domain is connected to another account. If you own it, contact support and we will verify ownership.");
  }
  if (existing[0]) return existing[0];
  const mine = await db.select().from(domains).where(eq(domains.hotelId, hotelId));
  if (mine.length) throw new DomainError("Remove your current custom domain before adding another one.");

  const provider = domainProvider();
  let created: { ref: string | null; ownership: DnsRecord | null };
  try {
    created = await provider.create(hostname);
  } catch (err) {
    throw new DomainError(`Our edge provider could not register this domain: ${(err as Error).message}`);
  }
  const [row] = await db
    .insert(domains)
    .values({ hotelId, hostname, provider: provider.name, providerRef: created.ref, status: "pending_dns", expected: expectedRecords(hostname, created.ownership), isPrimary: true })
    .returning();
  await audit(hotelId, actor, "domain.added", { hostname, provider: provider.name }, { target: row.id });
  return checkDomain(row.id);
}

async function ownerEmail(hotelId: string) {
  const db = await getDb();
  const [o] = await db
    .select({ email: users.email, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.hotelId, hotelId), eq(memberships.role, "owner")))
    .limit(1);
  return o ?? null;
}

/** Combines our DNS check with the provider's view into one state, and records transitions. */
export async function checkDomain(domainId: string): Promise<Domain> {
  const db = await getDb();
  const [d] = await db.select().from(domains).where(eq(domains.id, domainId));
  if (!d) throw new DomainError("Domain not found");

  const dns = await checkDns(d.hostname, config.domains.cnameTarget).catch(() => ({ kind: "none" as const, observed: [], issues: ["DNS lookup failed. We will retry automatically."] }));
  const provider = domainProvider(d.provider);
  const view = await provider.refresh(d.hostname, d.providerRef, dns.kind === "ok").catch((err: Error) => ({ status: null, issues: [`Provider check failed: ${err.message}`], ownership: undefined }));

  const wasLive = Boolean(d.activatedAt) && (d.status === "active" || d.status === "disconnected");
  let status: DomainStatus;
  if (view.status === "blocked") status = "blocked";
  else if (dns.kind === "none") status = wasLive ? "disconnected" : "pending_dns";
  else if (dns.kind === "wrong") status = wasLive ? "disconnected" : "wrong_record";
  else status = view.status ?? "provisioning_certificate";

  const now = new Date();
  const ownership = view.ownership === undefined ? (d.expected.find((r) => r.type === "TXT") ?? null) : view.ownership;
  const patch: Partial<Domain> = {
    status,
    observed: dns.observed,
    issues: [...dns.issues, ...view.issues].slice(0, 6),
    expected: expectedRecords(d.hostname, ownership),
    lastCheckedAt: now,
  };
  if (status === "active" && d.status !== "active") {
    patch.activatedAt = now;
    patch.disconnectedAt = null;
  }
  if (status === "disconnected" && d.status !== "disconnected") patch.disconnectedAt = now;
  const [updated] = await db.update(domains).set(patch).where(eq(domains.id, d.id)).returning();

  if (status !== d.status) {
    invalidateHotel(d.hotelId);
    await audit(d.hotelId, SYSTEM_ACTOR, "domain.status", { hostname: d.hostname, from: d.status, to: status }, { target: d.id });
    const owner = await ownerEmail(d.hotelId);
    const notify: Partial<Record<DomainStatus, string>> = {
      active: `Your website is now live at https://${d.hostname}. Your ${config.platformName} subdomain redirects there automatically.`,
      disconnected: `${d.hostname} no longer points to your website, so visitors may see an error. Restore the CNAME record within ${DISCONNECT_RELEASE_DAYS} days or the domain will be released. Your subdomain is serving your site meanwhile.`,
      blocked: `${d.hostname} was refused by our certificate provider. Please contact ${config.email.support}.`,
    };
    if (owner && notify[status]) {
      await sendPlatformEmail({
        to: owner.email,
        key: "domain_status",
        hotelId: d.hotelId,
        vars: { owner_name: owner.name, domain: d.hostname, status_label: DOMAIN_STATUS_COPY[status].label.toLowerCase(), detail: notify[status], link: appUrl("/dashboard/domain") },
      });
    }
  }
  return updated;
}

export async function removeDomain(hotelId: string, domainId: string, actor: AuditActor): Promise<void> {
  const db = await getDb();
  const [d] = await db.select().from(domains).where(and(eq(domains.id, domainId), eq(domains.hotelId, hotelId)));
  if (!d) return;
  await domainProvider(d.provider)
    .remove(d.hostname, d.providerRef)
    .catch((err) => console.error(`[domains] provider remove failed for ${d.hostname}`, err));
  await db.delete(domains).where(eq(domains.id, d.id));
  invalidateHotel(hotelId);
  await audit(hotelId, actor, "domain.removed", { hostname: d.hostname }, { target: d.id });
}

/** Staff override for the manual provider when TLS was verified out of band. */
export async function forceActivate(domainId: string, actor: AuditActor): Promise<void> {
  const db = await getDb();
  const [d] = await db.update(domains).set({ status: "active", activatedAt: new Date(), disconnectedAt: null, issues: [] }).where(eq(domains.id, domainId)).returning();
  if (d) {
    invalidateHotel(d.hotelId);
    await audit(d.hotelId, actor, "domain.force_activated", { hostname: d.hostname }, { target: d.id });
  }
}

/** Scheduled: poll pending names often, re-check live names, release long-disconnected ones. */
export async function runDomainJobs(now = new Date()): Promise<Record<string, number>> {
  const db = await getDb();
  const stats = { checked: 0, released: 0 };
  const pending = await db
    .select({ id: domains.id })
    .from(domains)
    .where(inArray(domains.status, ["pending_dns", "wrong_record", "ownership_required", "provisioning_certificate", "active", "disconnected"]));
  for (const d of pending) {
    try {
      await checkDomain(d.id);
      stats.checked++;
    } catch (err) {
      console.error("[domains] check failed", d.id, err);
    }
  }
  const stale = await db
    .select()
    .from(domains)
    .where(and(eq(domains.status, "disconnected"), lt(domains.disconnectedAt, new Date(now.getTime() - DISCONNECT_RELEASE_DAYS * 86_400_000))));
  for (const d of stale) {
    await removeDomain(d.hotelId, d.id, SYSTEM_ACTOR);
    stats.released++;
  }
  // Abandoned onboarding: pending for 30 days. Provider hostnames are billed while they exist.
  const abandoned = await db
    .select()
    .from(domains)
    .where(and(inArray(domains.status, ["pending_dns", "wrong_record", "ownership_required"]), lt(domains.createdAt, new Date(now.getTime() - 30 * 86_400_000))));
  for (const d of abandoned) {
    await removeDomain(d.hotelId, d.id, SYSTEM_ACTOR);
    stats.released++;
  }
  return stats;
}

export async function activeDomainFor(hotelId: string): Promise<Domain | null> {
  const db = await getDb();
  const [d] = await db
    .select()
    .from(domains)
    .where(and(eq(domains.hotelId, hotelId), eq(domains.status, "active"), eq(domains.isPrimary, true)))
    .limit(1);
  return d ?? null;
}
