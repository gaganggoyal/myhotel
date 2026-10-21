import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { randomToken, sha256 } from "./crypto";

type Purpose = "verify_email" | "reset_password" | "verify_reply_to";

/** Creates a single-use token; only its hash is stored. Returns the raw token for the link. */
export async function issueToken(purpose: Purpose, opts: { userId?: string; hotelId?: string; data?: Record<string, string>; ttlMinutes: number }): Promise<string> {
  const db = await getDb();
  const raw = randomToken(32);
  await db.insert(schema.authTokens).values({
    purpose,
    userId: opts.userId ?? null,
    hotelId: opts.hotelId ?? null,
    tokenHash: sha256(raw),
    data: opts.data ?? null,
    expiresAt: new Date(Date.now() + opts.ttlMinutes * 60_000),
  });
  return raw;
}

/** Atomically marks a valid, unused, unexpired token as used and returns it. */
export async function consumeToken(purpose: Purpose, raw: string) {
  if (!raw || raw.length > 100) return null;
  const db = await getDb();
  const [row] = await db
    .update(schema.authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.authTokens.tokenHash, sha256(raw)),
        eq(schema.authTokens.purpose, purpose),
        isNull(schema.authTokens.usedAt),
        gt(schema.authTokens.expiresAt, new Date()),
      ),
    )
    .returning();
  return row ?? null;
}
