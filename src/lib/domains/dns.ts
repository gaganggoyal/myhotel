import { Resolver } from "node:dns/promises";
import type { DnsRecord } from "@/db/schema";

// Platform-side DNS checks so owners never have to run dig. We query public resolvers
// directly to avoid stale local caches and report what we saw next to what we expected.

const CLOUDFLARE_V4 = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
  "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17",
  "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
];

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

export function inCidr(ip: string, cidr: string): boolean {
  const [range, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(range) & mask);
}

export function isCloudflareIp(ip: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(ip) && CLOUDFLARE_V4.some((c) => inCidr(ip, c));
}

export type DnsLookup = { cname: string[]; a: string[]; aaaa: string[] };

function resolver(): Resolver {
  const r = new Resolver({ timeout: 4000, tries: 2 });
  r.setServers(["1.1.1.1", "8.8.8.8"]);
  return r;
}

const strip = (h: string) => h.toLowerCase().replace(/\.$/, "");

export async function lookup(hostname: string): Promise<DnsLookup> {
  const r = resolver();
  const [cname, a, aaaa] = await Promise.all([
    r.resolveCname(hostname).catch(() => [] as string[]),
    r.resolve4(hostname).catch(() => [] as string[]),
    r.resolve6(hostname).catch(() => [] as string[]),
  ]);
  return { cname: cname.map(strip), a, aaaa };
}

export type DnsVerdict = { kind: "ok" | "none" | "wrong"; observed: DnsRecord[]; issues: string[] };

/** Pure evaluation of a lookup against the expected CNAME target (exported for tests). */
export function evaluateDns(hostname: string, target: string, seen: DnsLookup, targetSeen: DnsLookup): DnsVerdict {
  const observed: DnsRecord[] = [
    ...seen.cname.map((v) => ({ type: "CNAME" as const, name: hostname, value: v })),
    ...seen.a.map((v) => ({ type: "A" as const, name: hostname, value: v })),
    ...seen.aaaa.map((v) => ({ type: "AAAA" as const, name: hostname, value: v })),
  ];
  const issues: string[] = [];
  const t = strip(target);

  if (seen.cname.includes(t)) return { kind: "ok", observed, issues };
  if (!seen.cname.length && !seen.a.length && !seen.aaaa.length) {
    return { kind: "none", observed, issues: [`No DNS record found for ${hostname} yet. Most domains connect within a few hours; some take up to 48 hours.`] };
  }
  if (seen.cname.length) {
    issues.push(`${hostname} points to ${seen.cname[0]}. Change the CNAME so it points to ${t}.`);
    return { kind: "wrong", observed, issues };
  }

  // No CNAME but address records: acceptable only if they are the target's own addresses
  // (an ALIAS/ANAME or flattened CNAME at the DNS host).
  const targetA = new Set(targetSeen.a);
  const flattened = seen.a.length > 0 && seen.a.every((ip) => targetA.has(ip));
  if (flattened && (!seen.aaaa.length || seen.aaaa.every((ip) => targetSeen.aaaa.includes(ip)))) {
    return { kind: "ok", observed, issues };
  }
  const extraA = seen.a.filter((ip) => !targetA.has(ip));
  if (extraA.length) {
    if (extraA.some(isCloudflareIp) && !targetSeen.a.some(isCloudflareIp)) {
      issues.push("This record looks proxied through Cloudflare (orange cloud). Set it to “DNS only” (grey cloud) so we can issue your certificate.");
    } else {
      issues.push(`Remove the A record(s) ${extraA.join(", ")} for ${hostname} and add a CNAME to ${t} instead.`);
    }
  }
  if (seen.aaaa.length && !targetSeen.aaaa.length) {
    issues.push(`Remove the AAAA (IPv6) record(s) for ${hostname}; we do not serve IPv6 on this address.`);
  }
  if (!issues.length) issues.push(`${hostname} does not point to ${t} yet.`);
  return { kind: "wrong", observed, issues };
}

export async function checkDns(hostname: string, target: string): Promise<DnsVerdict> {
  const [seen, targetSeen] = await Promise.all([lookup(hostname), lookup(target)]);
  return evaluateDns(hostname, target, seen, targetSeen);
}
