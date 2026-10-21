import { createHmac } from "node:crypto";
import { getDb, schema } from "@/db";
import { safeEqual } from "./crypto";

/**
 * Svix signatures (used by Resend): base64 HMAC-SHA256 of "<id>.<timestamp>.<raw body>" with
 * the base64 secret after "whsec_". The header may carry several space-separated "v1,<sig>".
 */
export function verifySvix(rawBody: string, headers: Headers, secret: string, now = Date.now()): boolean {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigs = headers.get("svix-signature");
  if (!id || !ts || !sigs || !secret) return false;
  if (Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${rawBody}`).digest("base64");
  return sigs.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    return version === "v1" && Boolean(sig) && safeEqual(sig, expected);
  });
}

/** Records a webhook delivery; returns false if this event id was already processed. */
export async function firstDelivery(provider: string, eventId: string, type: string, payload: unknown): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .insert(schema.webhookEvents)
    .values({ provider, eventId, type, payload: payload as object })
    .onConflictDoNothing()
    .returning({ id: schema.webhookEvents.id });
  return rows.length > 0;
}
