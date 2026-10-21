import { resolveHost, type LoadedSite } from "./site";

// Helpers for the public endpoints served on hotel hosts (/api/site/*). The tenant always
// comes from the Host header via our own tables, never from the request body.

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });
}

export async function siteForRequest(req: Request): Promise<LoadedSite | null> {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const r = await resolveHost(host);
  if (r.type !== "site" || r.site.availability !== "live") return null;
  return r.site;
}

/** Rejects cross-site POSTs: the Origin, when present, must be the hotel's own host. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host.toLowerCase() === (req.headers.get("host") ?? "").toLowerCase();
  } catch {
    return false;
  }
}

const BOT_RE = /bot|crawler|spider|crawling|preview|facebookexternalhit|slurp|bingpreview|lighthouse|headless/i;

export function isBot(userAgent: string | null): boolean {
  return !userAgent || BOT_RE.test(userAgent);
}

export function deviceFromUa(ua: string | null): "mobile" | "tablet" | "desktop" {
  if (!ua) return "desktop";
  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/mobi|android|iphone/i.test(ua)) return "mobile";
  return "desktop";
}

export async function verifyTurnstile(token: string | undefined, ip: string, secret: string): Promise<boolean> {
  if (!secret) return true;
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const body = (await res.json()) as { success?: boolean };
    return Boolean(body.success);
  } catch {
    return false;
  }
}
