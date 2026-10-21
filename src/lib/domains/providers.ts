import type { DnsRecord, DomainStatus } from "@/db/schema";
import { config } from "../config";

// Edge providers that terminate TLS for customer hostnames. Each reports its own view;
// the service combines it with our DNS check to pick one of the eight dashboard states.

export type ProviderView = {
  /** null = no opinion, let the DNS check decide. */
  status: DomainStatus | null;
  issues: string[];
  ownership?: DnsRecord | null;
};

export interface DomainProvider {
  name: "manual" | "cloudflare" | "vercel";
  create(hostname: string): Promise<{ ref: string | null; ownership: DnsRecord | null }>;
  refresh(hostname: string, ref: string | null, dnsOk: boolean): Promise<ProviderView>;
  remove(hostname: string, ref: string | null): Promise<void>;
}

// ---------------------------------------------------------------------------
// Cloudflare for SaaS: POST/GET/PATCH/DELETE /zones/{zone}/custom_hostnames
// status: pending | active | moved | deleted | blocked | ...
// ssl.status: initializing | pending_validation | pending_issuance | pending_deployment | active | *_timed_out | ...
// ---------------------------------------------------------------------------

type CfHostname = {
  id: string;
  status: string;
  verification_errors?: string[];
  ownership_verification?: { type?: string; name?: string; value?: string };
  ssl?: { status?: string; validation_errors?: { message: string }[] };
};

async function cf<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${config.domains.cloudflareZoneId}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.domains.cloudflareToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = (await res.json()) as { success: boolean; result: T; errors?: { message: string }[] };
  if (!body.success) throw new Error(body.errors?.map((e) => e.message).join("; ") || `Cloudflare error ${res.status}`);
  return body.result;
}

function cfOwnership(h: CfHostname): DnsRecord | null {
  const o = h.ownership_verification;
  return o?.name && o.value ? { type: "TXT", name: o.name, value: o.value } : null;
}

const cloudflare: DomainProvider = {
  name: "cloudflare",
  async create(hostname) {
    const h = await cf<CfHostname>("/custom_hostnames", {
      method: "POST",
      body: JSON.stringify({ hostname, ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } } }),
    });
    return { ref: h.id, ownership: cfOwnership(h) };
  },
  async refresh(_hostname, ref, dnsOk) {
    if (!ref) return { status: null, issues: ["Missing Cloudflare hostname id"] };
    const h = await cf<CfHostname>(`/custom_hostnames/${ref}`);
    const sslStatus = h.ssl?.status ?? "";
    const issues = [...(h.verification_errors ?? []), ...(h.ssl?.validation_errors ?? []).map((e) => e.message)];
    if (["blocked", "pending_blocked", "test_blocked"].includes(h.status)) return { status: "blocked", issues };
    if (h.status === "active" && sslStatus === "active") return { status: "active", issues: [] };
    if (h.status === "active") {
      if (sslStatus.endsWith("_timed_out")) {
        // Ask Cloudflare to retry validation with the same method.
        await cf(`/custom_hostnames/${ref}`, { method: "PATCH", body: JSON.stringify({ ssl: { method: "http", type: "dv" } }) }).catch(() => undefined);
      }
      return { status: "provisioning_certificate", issues };
    }
    if ((h.status === "moved" || h.status === "deleted") && dnsOk) {
      await cf(`/custom_hostnames/${ref}`, { method: "PATCH", body: JSON.stringify({ ssl: { method: "http", type: "dv" } }) }).catch(() => undefined);
      return { status: "provisioning_certificate", issues };
    }
    if (h.status === "pending" && dnsOk) {
      const ownership = cfOwnership(h);
      if (ownership && (h.verification_errors ?? []).length) return { status: "ownership_required", issues, ownership };
      return { status: "provisioning_certificate", issues, ownership };
    }
    return { status: null, issues, ownership: cfOwnership(h) };
  },
  async remove(_hostname, ref) {
    if (ref) await cf(`/custom_hostnames/${ref}`, { method: "DELETE" });
  },
};

// ---------------------------------------------------------------------------
// Vercel for Platforms: project domains API
// ---------------------------------------------------------------------------

async function vercel<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = new URL(`https://api.vercel.com${path}`);
  if (config.domains.vercelTeamId) url.searchParams.set("teamId", config.domains.vercelTeamId);
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${config.domains.vercelToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message: string } };
  if (!res.ok) throw new Error(body.error?.message ?? `Vercel error ${res.status}`);
  return body;
}

type VercelDomain = { name: string; verified: boolean; verification?: { type: string; domain: string; value: string; reason: string }[] };

function vercelOwnership(d: VercelDomain): DnsRecord | null {
  const v = d.verification?.find((x) => x.type === "TXT");
  return v ? { type: "TXT", name: v.domain, value: v.value } : null;
}

const vercelProvider: DomainProvider = {
  name: "vercel",
  async create(hostname) {
    const d = await vercel<VercelDomain>(`/v10/projects/${config.domains.vercelProjectId}/domains`, { method: "POST", body: JSON.stringify({ name: hostname }) });
    return { ref: hostname, ownership: d.verified ? null : vercelOwnership(d) };
  },
  async refresh(hostname, _ref, dnsOk) {
    const project = config.domains.vercelProjectId;
    let d = await vercel<VercelDomain>(`/v9/projects/${project}/domains/${hostname}`);
    if (!d.verified) d = await vercel<VercelDomain>(`/v9/projects/${project}/domains/${hostname}/verify`, { method: "POST" }).catch(() => d);
    if (!d.verified) return { status: "ownership_required", issues: (d.verification ?? []).map((v) => v.reason), ownership: vercelOwnership(d) };
    const cfg = await vercel<{ misconfigured: boolean }>(`/v6/domains/${hostname}/config`);
    if (cfg.misconfigured) return { status: null, issues: [] };
    return { status: dnsOk ? "active" : null, issues: [] };
  },
  async remove(hostname) {
    await vercel(`/v9/projects/${config.domains.vercelProjectId}/domains/${hostname}`, { method: "DELETE" });
  },
};

// ---------------------------------------------------------------------------
// Manual: TLS handled by your own edge (e.g. Caddy on-demand TLS with
// /api/domains/allow as the "ask" endpoint). We only check DNS, then probe HTTPS.
// ---------------------------------------------------------------------------

const manual: DomainProvider = {
  name: "manual",
  async create() {
    return { ref: null, ownership: null };
  },
  async refresh(hostname, _ref, dnsOk) {
    if (!dnsOk) return { status: null, issues: [] };
    try {
      const res = await fetch(`https://${hostname}/api/domain-check`, { signal: AbortSignal.timeout(6000), cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && body.ok) return { status: "active", issues: [] };
      return { status: "provisioning_certificate", issues: [`HTTPS check returned ${res.status}.`] };
    } catch {
      return { status: "provisioning_certificate", issues: ["Waiting for the security certificate. You don’t need to do anything at your registrar."] };
    }
  },
  async remove() {},
};

export function domainProvider(name = config.domains.provider): DomainProvider {
  if (name === "cloudflare") return cloudflare;
  if (name === "vercel") return vercelProvider;
  return manual;
}
