import { headers } from "next/headers";
import { config } from "./config";

/**
 * Client IP for rate limits and logs, read only from the header our edge sets
 * (CLIENT_IP_HEADER). A proxy appends the address it saw to x-forwarded-for, so the last
 * entry is the one our edge wrote; earlier entries come from the client and can be forged.
 */
export function ipFromHeaders(h: Headers, header = config.clientIpHeader): string {
  const value = h.get(header);
  if (!value) return "unknown";
  return (header === "x-forwarded-for" ? value.split(",").at(-1) : value)?.trim() || "unknown";
}

export async function clientIp(): Promise<string> {
  return ipFromHeaders(await headers());
}

export function hostFromHeaders(h: Headers): string {
  return (h.get("host") ?? "").toLowerCase();
}
