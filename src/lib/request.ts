import { headers } from "next/headers";

/** Best-effort client IP. Behind Vercel/Cloudflare the first x-forwarded-for entry is the client. */
export function ipFromHeaders(h: Headers): string {
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function clientIp(): Promise<string> {
  return ipFromHeaders(await headers());
}

export function hostFromHeaders(h: Headers): string {
  return (h.get("host") ?? "").toLowerCase();
}
