import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * Fixed-window counter in Postgres. Good enough for form and login abuse at this scale and
 * works across instances; swap for Redis/Upstash if traffic grows.
 * Returns true when the action is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const db = await getDb();
  const resetAt = new Date(Date.now() + windowSeconds * 1000);
  const rows = await db
    .insert(schema.rateLimits)
    .values({ key, count: 1, resetAt })
    .onConflictDoUpdate({
      target: schema.rateLimits.key,
      set: {
        count: sql`CASE WHEN ${schema.rateLimits.resetAt} < now() THEN 1 ELSE ${schema.rateLimits.count} + 1 END`,
        resetAt: sql`CASE WHEN ${schema.rateLimits.resetAt} < now() THEN ${resetAt.toISOString()}::timestamptz ELSE ${schema.rateLimits.resetAt} END`,
      },
    })
    .returning({ count: schema.rateLimits.count });
  return (rows[0]?.count ?? 1) <= limit;
}

export async function purgeExpiredRateLimits(): Promise<void> {
  const db = await getDb();
  await db.delete(schema.rateLimits).where(sql`${schema.rateLimits.resetAt} < now() - interval '1 day'`);
}
