// Host classification and slug rules. Pure functions, safe to import from proxy.ts.

export type HostKind =
  | { kind: "platform" }
  | { kind: "platform-www" }
  | { kind: "subdomain"; slug: string }
  | { kind: "custom"; hostname: string }
  | { kind: "invalid" };

/**
 * Labels a routing stack already treats as infrastructure, plus mail/certificate names and
 * marketing hosts. Owners can never claim these as their subdomain.
 */
export const RESERVED_SLUGS = new Set([
  "www", "app", "admin", "api", "dashboard", "mail", "smtp", "imap", "pop", "pop3", "webmail",
  "email", "autoconfig", "autodiscover", "status", "docs", "blog", "support", "help", "cdn",
  "static", "assets", "media", "img", "images", "files", "ns", "ns1", "ns2", "ns3", "ns4",
  "dns", "mx", "wildcard", "acme", "_acme-challenge", "_cf-custom-hostname", "hotels", "hotel",
  "sites", "site", "customers", "preview", "staging", "dev", "test", "demo", "login", "signup",
  "register", "account", "billing", "pay", "payment", "payments", "secure", "security", "abuse",
  "postmaster", "hostmaster", "webmaster", "root", "about", "pricing", "legal", "privacy",
  "terms", "official", "verify", "verification", "booking", "bookings", "reservations",
  "myhotel", "platform", "internal", "localhost",
]);

/** Brands and impersonation bait we refuse as a subdomain on the platform's own domain. */
const BLOCKED_SUBSTRINGS = [
  "paytm", "phonepe", "googlepay", "gpay", "razorpay", "bhim", "npci", "makemytrip", "goibibo",
  "booking-com", "bookingcom", "airbnb", "agoda", "expedia", "tripadvisor", "oyo", "taj-hotels",
  "tajhotels", "marriott", "hilton", "hyatt", "ihg", "itc-hotels", "oberoi", "irctc", "sbi-",
  "hdfc", "icici", "axisbank", "kotak", "gov-in", "government", "ministry", "police",
];

const PROFANITY = ["fuck", "shit", "bitch", "chutiya", "madarchod", "bhenchod", "randi", "porn", "sex"];

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;

export function normalizeSlug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "-and-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
}

export function validateSlug(slug: string): string | null {
  if (slug.length < 3) return "Use at least 3 characters.";
  if (slug.length > 63) return "Use at most 63 characters.";
  if (!SLUG_RE.test(slug)) return "Use lowercase letters, digits and hyphens (not at the start or end).";
  if (slug.includes("--")) return "Avoid consecutive hyphens.";
  if (RESERVED_SLUGS.has(slug)) return "This name is reserved.";
  if (BLOCKED_SUBSTRINGS.some((b) => slug.includes(b))) return "This name looks like another brand. Choose your property's own name.";
  if (PROFANITY.some((w) => slug.includes(w))) return "Choose a different name.";
  return null;
}

const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

export function isValidHostname(host: string): boolean {
  return HOSTNAME_RE.test(host);
}

/**
 * Two-level public suffixes common for our market. A full Public Suffix List lookup would be
 * more complete; this covers the domains Indian hotels actually register.
 */
const MULTI_LABEL_SUFFIXES = new Set([
  "co.in", "net.in", "org.in", "firm.in", "gen.in", "ind.in", "ac.in", "edu.in", "res.in",
  "gov.in", "nic.in", "co.uk", "org.uk", "me.uk", "com.au", "net.au", "org.au", "co.nz",
  "com.sg", "com.my", "co.th", "in.th", "com.np", "com.lk", "com.bd", "co.za", "com.br",
]);

/** The registrable domain (eTLD+1) for a hostname, using the short suffix list above. */
export function registrableDomain(hostname: string): string {
  const labels = hostname.split(".");
  if (labels.length <= 2) return hostname;
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_LABEL_SUFFIXES.has(lastTwo)) return labels.slice(-3).join(".");
  return lastTwo;
}

/** True when the hostname is a zone apex (naked domain), where a CNAME is not allowed. */
export function isApexDomain(hostname: string): boolean {
  return registrableDomain(hostname) === hostname;
}

export function classifyHost(rawHost: string, rootDomain: string): HostKind {
  const host = rawHost.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return { kind: "invalid" };
  if (host === rootDomain) return { kind: "platform" };
  if (host === `www.${rootDomain}`) return { kind: "platform-www" };

  const suffix = `.${rootDomain}`;
  if (host.endsWith(suffix)) {
    const label = host.slice(0, -suffix.length);
    // Only one label under the platform domain: the wildcard certificate covers one level.
    if (!label || label.includes(".")) return { kind: "invalid" };
    if (!/^[a-z0-9-]{1,63}$/.test(label)) return { kind: "invalid" };
    return { kind: "subdomain", slug: label };
  }

  const [hostname, port] = host.split(":");
  if (port && !/^\d+$/.test(port)) return { kind: "invalid" };
  if (!isValidHostname(hostname)) return { kind: "invalid" };
  return { kind: "custom", hostname: host };
}

/** Encodes a host for use as a single path segment (ports use "_" since ":" is awkward). */
export function encodeHostSegment(host: string): string {
  return host.replace(/:/g, "_");
}

export function decodeHostSegment(segment: string): string {
  return decodeURIComponent(segment).replace(/_/g, ":");
}
